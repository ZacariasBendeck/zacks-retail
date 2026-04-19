from marshmallow import fields
from odoo.addons.datamodel.core import Datamodel


class CartAddItemParam(Datamodel):
    _name = "cart.add.item.param"

    product_id = fields.Integer(required=True)
    quantity = fields.Integer(load_default=1)


class CartUpdateItemParam(Datamodel):
    _name = "cart.update.item.param"

    line_id = fields.Integer(required=True)
    quantity = fields.Integer(required=True)


class CartLineOutput(Datamodel):
    _name = "cart.line.output"

    id = fields.Integer(required=True)
    product_id = fields.Integer(required=True)
    product_name = fields.String(required=True)
    product_image = fields.String(allow_none=True)
    sku_code = fields.String(allow_none=True)
    size = fields.String(allow_none=True)
    color = fields.String(allow_none=True)
    quantity = fields.Integer(required=True)
    unit_price = fields.Float(required=True)
    subtotal = fields.Float(required=True)


class CartOutput(Datamodel):
    _name = "cart.output"

    id = fields.Integer(required=True)
    lines = fields.List(fields.Nested("cart.line.output"))
    item_count = fields.Integer(required=True)
    subtotal = fields.Float(required=True)
    tax = fields.Float(required=True)
    total = fields.Float(required=True)
