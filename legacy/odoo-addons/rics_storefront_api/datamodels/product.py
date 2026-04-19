from marshmallow import fields
from odoo.addons.datamodel.core import Datamodel


class ProductSearchParam(Datamodel):
    _name = "product.search.param"

    page = fields.Integer(load_default=1)
    limit = fields.Integer(load_default=24)
    sort = fields.String(load_default="name")
    order = fields.String(load_default="asc")
    q = fields.String(load_default=None, allow_none=True)
    department = fields.String(load_default=None, allow_none=True)
    category_id = fields.Integer(load_default=None, allow_none=True)
    brand_id = fields.Integer(load_default=None, allow_none=True)
    color_id = fields.Integer(load_default=None, allow_none=True)
    size_label = fields.String(load_default=None, allow_none=True)
    material_id = fields.Integer(load_default=None, allow_none=True)
    min_price = fields.Float(load_default=None, allow_none=True)
    max_price = fields.Float(load_default=None, allow_none=True)


class ProductCardOutput(Datamodel):
    _name = "product.card.output"

    id = fields.Integer(required=True)
    name = fields.String(required=True)
    brand = fields.String(allow_none=True)
    price = fields.Float(required=True)
    main_image = fields.String(allow_none=True)
    rating = fields.Float(allow_none=True)
    department = fields.String(required=True)
    style = fields.String(required=True)
    color_swatches = fields.List(fields.Dict())


class ProductDetailOutput(Datamodel):
    _name = "product.detail.output"

    id = fields.Integer(required=True)
    sku_code = fields.String(required=True)
    name = fields.String(required=True)
    brand = fields.String(allow_none=True)
    price = fields.Float(required=True)
    department = fields.String(required=True)
    style = fields.String(required=True)
    description = fields.String(allow_none=True)
    material = fields.String(allow_none=True)
    main_image = fields.String(allow_none=True)
    category = fields.String(allow_none=True)
    color = fields.String(allow_none=True)
    available_sizes = fields.List(fields.Dict())
    available_colors = fields.List(fields.Dict())
    specs = fields.Dict()


class FacetsOutput(Datamodel):
    _name = "product.facets.output"

    brands = fields.List(fields.Dict())
    colors = fields.List(fields.Dict())
    sizes = fields.List(fields.Dict())
    categories = fields.List(fields.Dict())
    departments = fields.List(fields.Dict())
    materials = fields.List(fields.Dict())
    price_range = fields.Dict()
