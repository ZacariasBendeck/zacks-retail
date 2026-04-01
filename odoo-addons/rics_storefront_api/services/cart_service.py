import logging
from odoo.addons.base_rest import restapi
from odoo.addons.base_rest_datamodel.restapi import Datamodel
from odoo.addons.component.core import Component

_logger = logging.getLogger(__name__)


class CartService(Component):
    _inherit = "base.rest.service"
    _name = "cart.rest.service"
    _usage = "cart"
    _collection = "rics.storefront.api"
    _description = "Shopping cart REST endpoints"

    @restapi.method(
        [(["/"], "GET")],
    )
    def get(self):
        """Get the current user's cart (sale.order in draft state)."""
        order = self._get_or_create_cart()
        return self._to_cart_output(order)

    @restapi.method(
        [(["/items"], "POST")],
        input_param=Datamodel("cart.add.item.param"),
    )
    def add_item(self, params):
        """Add a product variant to the cart."""
        order = self._get_or_create_cart()
        product = self.env["product.product"].sudo().browse(params.product_id)
        if not product.exists():
            raise Exception("Product not found")

        existing_line = order.order_line.filtered(
            lambda l: l.product_id.id == params.product_id
        )
        if existing_line:
            existing_line.product_uom_qty += params.quantity
        else:
            self.env["sale.order.line"].sudo().create({
                "order_id": order.id,
                "product_id": params.product_id,
                "product_uom_qty": params.quantity,
            })

        return self._to_cart_output(order)

    @restapi.method(
        [(["/items"], "PATCH")],
        input_param=Datamodel("cart.update.item.param"),
    )
    def update_item(self, params):
        """Update quantity of a cart line item."""
        order = self._get_or_create_cart()
        line = order.order_line.filtered(lambda l: l.id == params.line_id)
        if not line:
            raise Exception("Cart line not found")

        if params.quantity <= 0:
            line.unlink()
        else:
            line.product_uom_qty = params.quantity

        return self._to_cart_output(order)

    @restapi.method(
        [(["/items/<int:line_id>"], "DELETE")],
    )
    def remove_item(self, line_id):
        """Remove a line item from the cart."""
        order = self._get_or_create_cart()
        line = order.order_line.filtered(lambda l: l.id == line_id)
        if line:
            line.unlink()
        return self._to_cart_output(order)

    def _get_or_create_cart(self):
        """Get current draft sale order or create one."""
        partner = self.env.user.partner_id
        order = self.env["sale.order"].sudo().search([
            ("partner_id", "=", partner.id),
            ("state", "=", "draft"),
            ("website_id", "!=", False),
        ], limit=1, order="create_date desc")

        if not order:
            order = self.env["sale.order"].sudo().create({
                "partner_id": partner.id,
                "website_id": self.env["website"].sudo().get_current_website().id,
            })
        return order

    def _to_cart_output(self, order):
        lines = []
        for line in order.order_line:
            variant = line.product_id
            size = None
            color = None
            for attr_val in variant.product_template_attribute_value_ids:
                attr_name = attr_val.attribute_id.name.lower()
                if attr_name in ("talla", "size"):
                    size = attr_val.name
                elif attr_name == "color":
                    color = attr_val.name

            lines.append({
                "id": line.id,
                "productId": variant.id,
                "productName": variant.name,
                "productImage": f"/web/image/product.product/{variant.id}/image_256" if variant.image_256 else None,
                "skuCode": variant.default_code or None,
                "size": size,
                "color": color,
                "quantity": int(line.product_uom_qty),
                "unitPrice": line.price_unit,
                "subtotal": line.price_subtotal,
            })

        return {
            "id": order.id,
            "lines": lines,
            "itemCount": sum(int(l.product_uom_qty) for l in order.order_line),
            "subtotal": order.amount_untaxed,
            "tax": order.amount_tax,
            "total": order.amount_total,
        }
