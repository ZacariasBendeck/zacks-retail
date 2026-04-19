import logging
from odoo.addons.base_rest import restapi
from odoo.addons.base_rest_datamodel.restapi import Datamodel
from odoo.addons.component.core import Component

_logger = logging.getLogger(__name__)


class ProductService(Component):
    _inherit = "base.rest.service"
    _name = "product.rest.service"
    _usage = "products"
    _collection = "rics.storefront.api"
    _description = "Product catalog REST endpoints"

    @restapi.method(
        [(["/"], "GET")],
        input_param=Datamodel("product.search.param"),
    )
    def search(self, params):
        """List products with pagination, sorting, and faceted filters."""
        domain = self._build_domain(params)
        order = self._build_order(params)
        offset = (params.page - 1) * params.limit

        products = self.env["product.template"].sudo().search(
            domain, limit=params.limit, offset=offset, order=order
        )
        total = self.env["product.template"].sudo().search_count(domain)

        return {
            "data": [self._to_card(p) for p in products],
            "pagination": {
                "page": params.page,
                "limit": params.limit,
                "totalItems": total,
                "totalPages": (total + params.limit - 1) // params.limit,
            },
        }

    @restapi.method(
        [(["/facets"], "GET")],
        input_param=Datamodel("product.search.param"),
    )
    def facets(self, params):
        """Return faceted filter counts for the current search."""
        domain = self._build_domain(params)
        products = self.env["product.template"].sudo().search(domain)
        return self._compute_facets(products, params)

    @restapi.method(
        [(["/<int:product_id>"], "GET")],
    )
    def get(self, product_id):
        """Get a single product with full detail."""
        product = self.env["product.template"].sudo().browse(product_id)
        if not product.exists() or not product.sale_ok:
            raise Exception("Product not found")
        return self._to_detail(product)

    def _build_domain(self, params):
        domain = [("sale_ok", "=", True), ("active", "=", True)]
        if params.q:
            domain += ["|", ("name", "ilike", params.q), ("default_code", "ilike", params.q)]
        if params.department:
            domain += [("x_department", "=", params.department)]
        if params.category_id:
            domain += [("categ_id", "=", params.category_id)]
        if params.brand_id:
            domain += [("x_brand_id", "=", params.brand_id)]
        if params.min_price:
            domain += [("list_price", ">=", params.min_price)]
        if params.max_price:
            domain += [("list_price", "<=", params.max_price)]
        return domain

    def _build_order(self, params):
        sort_map = {
            "price": "list_price",
            "name": "name",
            "newest": "create_date",
        }
        field = sort_map.get(params.sort, "name")
        direction = "ASC" if params.order == "asc" else "DESC"
        return f"{field} {direction}"

    def _to_card(self, product):
        return {
            "id": product.id,
            "name": product.name,
            "brand": product.x_brand_id.name if product.x_brand_id else None,
            "price": product.list_price,
            "mainImage": f"/web/image/product.template/{product.id}/image_1024" if product.image_1024 else None,
            "rating": None,
            "department": product.x_department or "",
            "style": product.x_style or product.name,
            "colorSwatches": [],
        }

    def _to_detail(self, product):
        sizes = []
        colors = []
        for variant in product.product_variant_ids:
            for attr_value in variant.product_template_attribute_value_ids:
                attr = attr_value.attribute_id
                if attr.name.lower() in ("talla", "size"):
                    qty = variant.qty_available
                    sizes.append({
                        "id": str(variant.id),
                        "label": attr_value.name,
                        "inStock": qty > 0,
                    })
                elif attr.name.lower() in ("color",):
                    colors.append({
                        "colorId": attr_value.id,
                        "name": attr_value.name,
                        "code": attr_value.html_color or "",
                    })
        return {
            "id": product.id,
            "skuCode": product.default_code or "",
            "name": product.name,
            "brand": product.x_brand_id.name if product.x_brand_id else None,
            "price": product.list_price,
            "department": product.x_department or "",
            "style": product.x_style or product.name,
            "description": product.description_sale or None,
            "material": None,
            "mainImage": f"/web/image/product.template/{product.id}/image_1024" if product.image_1024 else None,
            "category": product.categ_id.name if product.categ_id else None,
            "color": None,
            "availableSizes": sizes,
            "availableColors": colors,
            "specs": {},
        }

    def _compute_facets(self, products, params):
        brands = {}
        departments = {}
        categories = {}
        prices = []

        for p in products:
            if p.x_brand_id:
                key = p.x_brand_id.id
                brands.setdefault(key, {"id": key, "name": p.x_brand_id.name, "count": 0})
                brands[key]["count"] += 1
            if p.x_department:
                departments.setdefault(p.x_department, {"name": p.x_department, "count": 0})
                departments[p.x_department]["count"] += 1
            if p.categ_id:
                key = p.categ_id.id
                categories.setdefault(key, {"id": key, "name": p.categ_id.name, "count": 0})
                categories[key]["count"] += 1
            prices.append(p.list_price)

        return {
            "brands": list(brands.values()),
            "colors": [],
            "sizes": [],
            "categories": list(categories.values()),
            "departments": list(departments.values()),
            "materials": [],
            "priceRange": {"min": min(prices) if prices else 0, "max": max(prices) if prices else 0},
        }
