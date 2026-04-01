from marshmallow import fields
from odoo.addons.datamodel.core import Datamodel


class CheckoutParam(Datamodel):
    _name = "checkout.param"

    shipping_name = fields.String(required=True)
    shipping_phone = fields.String(required=True)
    shipping_address = fields.String(required=True)
    shipping_city = fields.String(required=True)
    shipping_department = fields.String(required=True)
    shipping_notes = fields.String(allow_none=True, load_default=None)
    payment_method = fields.String(required=True)


class OrderOutput(Datamodel):
    _name = "order.output"

    id = fields.Integer(required=True)
    name = fields.String(required=True)
    status = fields.String(required=True)
    date = fields.String(required=True)
    lines = fields.List(fields.Dict())
    subtotal = fields.Float(required=True)
    tax = fields.Float(required=True)
    total = fields.Float(required=True)
    shipping = fields.Dict(allow_none=True)
