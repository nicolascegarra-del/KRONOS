from typing import Optional

from sqlmodel import SQLModel, Field

# Default HTML invoice template with {{VARIABLE}} placeholders
DEFAULT_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .logo img { max-height: 80px; max-width: 200px; }
    .invoice-title { font-size: 26px; font-weight: bold; color: #0f172a; text-align: right; }
    .invoice-meta { text-align: right; color: #555; margin-top: 6px; font-size: 12px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 20px; }
    .party { flex: 1; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 6px; }
    .party p { font-size: 13px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #0f172a; color: #fff; }
    thead th { padding: 10px 12px; text-align: left; font-size: 12px; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    .totals { margin-left: auto; width: 260px; }
    .totals table { margin-bottom: 0; }
    .totals td { padding: 6px 12px; }
    .totals .total-row { font-weight: bold; font-size: 15px; background: #0f172a; color: #fff; }
    .notes { margin-top: 32px; font-size: 12px; color: #666; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">{{LOGO}}</div>
    <div>
      <div class="invoice-title">FACTURA</div>
      <div class="invoice-meta">
        <div>N&#176; {{INVOICE_NUMBER}}</div>
        <div>Fecha: {{DATE}}</div>
        <div>Vencimiento: {{DUE_DATE}}</div>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Emisor</h3>
      <p><strong>{{ISSUER_NAME}}</strong></p>
      <p>NIF: {{ISSUER_NIF}}</p>
      <p>{{ISSUER_ADDRESS}}</p>
      <p>{{ISSUER_CITY}}</p>
      <p>{{ISSUER_EMAIL}}</p>
    </div>
    <div class="party">
      <h3>Cliente</h3>
      <p><strong>{{CLIENT_NAME}}</strong></p>
      <p>NIF: {{CLIENT_NIF}}</p>
      <p>{{CLIENT_ADDRESS}}</p>
      <p>{{CLIENT_CITY}}</p>
      <p>{{CLIENT_EMAIL}}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripci&#243;n</th>
        <th>Plan</th>
        <th>Precio base</th>
        <th>Descuento</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Suscripci&#243;n KRONOS &#8212; Control de fichajes</td>
        <td>{{PLAN}}</td>
        <td>{{PRICE}} &#8364;</td>
        <td>{{DISCOUNT}}%</td>
        <td>{{SUBTOTAL}} &#8364;</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Base imponible</td><td>{{SUBTOTAL}} &#8364;</td></tr>
      <tr><td>IVA (21%)</td><td>{{VAT}} &#8364;</td></tr>
      <tr class="total-row"><td>TOTAL</td><td>{{TOTAL}} &#8364;</td></tr>
    </table>
  </div>

  <div class="notes">{{NOTES}}</div>
</body>
</html>"""


class InvoiceConfig(SQLModel, table=True):
    __tablename__ = "invoice_config"

    id: int = Field(default=1, primary_key=True)

    # Issuer (your company — KRONOS)
    issuer_name: str = Field(default="KRONOS SL")
    issuer_nif: str = Field(default="")
    issuer_address: str = Field(default="")
    issuer_city: str = Field(default="")
    issuer_postal_code: str = Field(default="")
    issuer_phone: str = Field(default="")
    issuer_email: str = Field(default="")

    # Logo stored as base64 data URL (e.g. "data:image/png;base64,...")
    logo_base64: Optional[str] = Field(default=None)

    # Invoice numbering
    invoice_prefix: str = Field(default="FAC")
    next_invoice_number: int = Field(default=1)

    # Notes shown at bottom of invoice
    notes: Optional[str] = Field(default="Gracias por confiar en KRONOS.")

    # HTML template with {{VARIABLE}} placeholders
    html_template: str = Field(default=DEFAULT_TEMPLATE)
