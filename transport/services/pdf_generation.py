from io import BytesIO
from reportlab.pdfgen import canvas


def gerar_dacte_pdf(cte):
    """Gera um PDF simples para o DACTE do CT-e fornecido."""
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.drawString(50, 800, "DACTE")
    pdf.drawString(50, 780, f"Chave: {cte.chave}")
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def gerar_damdfe_pdf(mdfe):
    """Gera um PDF simples para o DAMDFE do MDF-e fornecido."""
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.drawString(50, 800, "DAMDFE")
    pdf.drawString(50, 780, f"Chave: {mdfe.chave}")
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()
