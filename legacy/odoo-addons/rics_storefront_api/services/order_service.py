import logging
from odoo.addons.base_rest import restapi
from odoo.addons.base_rest_datamodel.restapi import Datamodel
from odoo.addons.component.core import Component

_logger = logging.getLogger(__name__)


class OrderService(Component):
    _inherit = "base.rest.service"
    _name = "order.rest.service"
    _usage = "orders"
    _collection = "rics.storefront.api"
    _description = "Order/checkout REST endpoints"

    @restapi.method(
        [(["/"], "POST")],
        input_param=Datamodel("checkout.param"),
    )
    def create(self, params):
        """Confirm cart as a sale order (checkout)."""
        partner = self.env.user.partner_id
        order = self.env["sale.order"].sudo().search([
            ("partner_id", "=", partner.id),
            ("state", "=", "draft"),
            ("website_id", "!=", False),
        ], limit=1, order="create_date desc")

        if not order or not order.order_line:
            raise Exception("Cart is empty")

        order.write({
            "note": f"Envio: {params.shipping_name}, {params.shipping_phone}\n"
                    f"{params.shipping_address}, {params.shipping_city}, {params.shipping_department}\n"
                    f"Notas: {params.shipping_notes or 'N/A'}\n"
                    f"Pago: {params.payment_method}",
        })

        order.action_confirm()
        return self._to_order_output(order)

    @restapi.method(
        [(["/<int:order_id>"], "GET")],
    )
    def get(self, order_id):
        """Get order details."""
        order = self.env["sale.order"].sudo().browse(order_id)
        if not order.exists():
            raise Exception("Order not found")
        return self._to_order_output(order)

    def _to_order_output(self, order):
        lines = []
        for line in order.order_line:
            lines.append({
                "productName": line.product_id.name,
                "quantity": int(line.product_uom_qty),
                "unitPrice": line.price_unit,
                "subtotal": line.price_subtotal,
            })

        return {
            "id": order.id,
            "name": order.name,
            "status": order.state,
            "date": order.date_order.isoformat() if order.date_order else "",
            "lines": lines,
            "subtotal": order.amount_untaxed,
            "tax": order.amount_tax,
            "total": order.amount_total,
            "shipping": None,
        }
