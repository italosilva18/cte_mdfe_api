# transport/services/damdfe_generator.py
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph
from io import BytesIO
import qrcode
import barcode
from barcode.writer import ImageWriter
from datetime import datetime
import textwrap

class DAMDFEGenerator:
    def __init__(self, mdfe):
        self.mdfe = mdfe
        self.buffer = BytesIO()
        self.width, self.height = A4
        self.margin = 10 * mm
        self.c = canvas.Canvas(self.buffer, pagesize=A4)
        
    def generate(self):
        """Gera o DAMDFE completo"""
        self._draw_header()
        self._draw_identification()
        self._draw_modal_info()
        self._draw_vehicles()
        self._draw_drivers()
        self._draw_documents()
        self._draw_totals()
        self._draw_additional_info()
        self._draw_footer()
        
        # Salvar o PDF
        self.c.save()
        self.buffer.seek(0)
        return self.buffer
        
    def _draw_header(self):
        """Desenha o cabeçalho do DAMDFE"""
        y = self.height - self.margin - 20 * mm
        
        # Box principal
        self.c.setStrokeColor(colors.black)
        self.c.setLineWidth(1)
        self.c.rect(self.margin, y - 30 * mm, self.width - 2 * self.margin, 30 * mm)
        
        # Título
        self.c.setFont("Helvetica-Bold", 12)
        self.c.drawCentredString(self.width / 2, y - 5 * mm, "DAMDFE - Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais")
        
        # Informações do emitente
        emitente = self.mdfe.emitente
        self.c.setFont("Helvetica", 10)
        self.c.drawString(self.margin + 5 * mm, y - 12 * mm, f"Emitente: {emitente.razao_social}")
        self.c.drawString(self.margin + 5 * mm, y - 17 * mm, f"CNPJ: {self._format_cnpj(emitente.cnpj)}")
        self.c.drawString(self.margin + 5 * mm, y - 22 * mm, f"IE: {emitente.ie}")
        
        # Endereço
        endereco = f"{emitente.logradouro}, {emitente.numero}"
        if emitente.complemento:
            endereco += f" - {emitente.complemento}"
        self.c.drawString(self.margin + 5 * mm, y - 27 * mm, f"{endereco} - {emitente.bairro} - {emitente.municipio}/{emitente.uf}")
        
        # QR Code
        qr_data = self._generate_qr_code()
        qr_x = self.width - self.margin - 40 * mm
        qr_y = y - 30 * mm
        self.c.drawImage(qr_data, qr_x, qr_y, width=30 * mm, height=30 * mm)
        
        return y - 35 * mm
        
    def _draw_identification(self):
        """Desenha as informações de identificação do MDF-e"""
        y = self.height - self.margin - 55 * mm
        
        # Box
        self.c.rect(self.margin, y - 25 * mm, self.width - 2 * self.margin, 25 * mm)
        
        # Divisões verticais
        col1_x = self.margin + (self.width - 2 * self.margin) * 0.3
        col2_x = self.margin + (self.width - 2 * self.margin) * 0.6
        
        self.c.line(col1_x, y, col1_x, y - 25 * mm)
        self.c.line(col2_x, y, col2_x, y - 25 * mm)
        
        # Informações
        ide = self.mdfe.identificacao
        self.c.setFont("Helvetica-Bold", 9)
        
        # Coluna 1
        self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "MODELO")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(self.margin + 2 * mm, y - 10 * mm, ide.mod)
        
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(self.margin + 2 * mm, y - 15 * mm, "SÉRIE")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(self.margin + 2 * mm, y - 20 * mm, str(ide.serie))
        
        # Coluna 2
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(col1_x + 2 * mm, y - 5 * mm, "NÚMERO")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(col1_x + 2 * mm, y - 10 * mm, str(ide.n_mdf))
        
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(col1_x + 2 * mm, y - 15 * mm, "DATA/HORA EMISSÃO")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(col1_x + 2 * mm, y - 20 * mm, ide.dh_emi.strftime("%d/%m/%Y %H:%M"))
        
        # Coluna 3
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(col2_x + 2 * mm, y - 5 * mm, "UF INÍCIO")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(col2_x + 2 * mm, y - 10 * mm, ide.uf_ini)
        
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(col2_x + 2 * mm, y - 15 * mm, "UF FIM")
        self.c.setFont("Helvetica", 9)
        self.c.drawString(col2_x + 2 * mm, y - 20 * mm, ide.uf_fim)
        
        # Código de barras
        barcode_data = self._generate_barcode()
        self.c.drawImage(barcode_data, self.margin + 5 * mm, y - 45 * mm, width=100 * mm, height=15 * mm)
        
        # Chave de acesso
        self.c.setFont("Helvetica", 8)
        self.c.drawCentredString(self.width / 2, y - 50 * mm, f"CHAVE DE ACESSO: {self._format_chave(self.mdfe.chave)}")
        
        return y - 55 * mm
        
    def _draw_modal_info(self):
        """Desenha informações do modal rodoviário"""
        y = self.height - self.margin - 115 * mm
        
        # Verificar se existe modal rodoviário
        if not hasattr(self.mdfe, 'modal_rodoviario'):
            return y
            
        modal = self.mdfe.modal_rodoviario
        
        # Box
        self.c.rect(self.margin, y - 15 * mm, self.width - 2 * self.margin, 15 * mm)
        
        self.c.setFont("Helvetica-Bold", 10)
        self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "MODAL RODOVIÁRIO")
        
        self.c.setFont("Helvetica", 9)
        if modal.rntrc:
            self.c.drawString(self.margin + 2 * mm, y - 12 * mm, f"RNTRC: {modal.rntrc}")
            
        # CIOT se houver
        if modal.ciots.exists():
            ciots = ", ".join([c.ciot for c in modal.ciots.all()])
            self.c.drawString(self.margin + 50 * mm, y - 12 * mm, f"CIOT: {ciots}")
            
        return y - 20 * mm
        
    def _draw_vehicles(self):
        """Desenha informações dos veículos"""
        y = self.height - self.margin - 140 * mm
        
        if not hasattr(self.mdfe, 'modal_rodoviario'):
            return y
            
        modal = self.mdfe.modal_rodoviario
        
        # Veículo de tração
        if hasattr(modal, 'veiculo_tracao'):
            veiculo = modal.veiculo_tracao
            
            self.c.rect(self.margin, y - 20 * mm, self.width - 2 * self.margin, 20 * mm)
            self.c.setFont("Helvetica-Bold", 10)
            self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "VEÍCULO TRAÇÃO")
            
            self.c.setFont("Helvetica", 9)
            self.c.drawString(self.margin + 2 * mm, y - 12 * mm, f"Placa: {veiculo.placa}")
            self.c.drawString(self.margin + 40 * mm, y - 12 * mm, f"RENAVAM: {veiculo.renavam or '-'}")
            self.c.drawString(self.margin + 90 * mm, y - 12 * mm, f"Tara: {veiculo.tara} kg")
            
            if veiculo.prop_razao_social:
                self.c.drawString(self.margin + 2 * mm, y - 18 * mm, f"Proprietário: {veiculo.prop_razao_social}")
                
            y = y - 25 * mm
            
        # Veículos reboque
        if modal.veiculos_reboque.exists():
            for reboque in modal.veiculos_reboque.all():
                self.c.rect(self.margin, y - 15 * mm, self.width - 2 * self.margin, 15 * mm)
                self.c.setFont("Helvetica-Bold", 9)
                self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "REBOQUE")
                
                self.c.setFont("Helvetica", 9)
                self.c.drawString(self.margin + 2 * mm, y - 12 * mm, f"Placa: {reboque.placa}")
                self.c.drawString(self.margin + 40 * mm, y - 12 * mm, f"RENAVAM: {reboque.renavam or '-'}")
                self.c.drawString(self.margin + 90 * mm, y - 12 * mm, f"Tara: {reboque.tara} kg")
                
                y = y - 20 * mm
                
        return y
        
    def _draw_drivers(self):
        """Desenha informações dos condutores"""
        y = self.height - self.margin - 200 * mm
        
        if not self.mdfe.condutores.exists():
            return y
            
        # Box
        height = 10 * mm + (5 * mm * self.mdfe.condutores.count())
        self.c.rect(self.margin, y - height, self.width - 2 * self.margin, height)
        
        self.c.setFont("Helvetica-Bold", 10)
        self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "CONDUTORES")
        
        self.c.setFont("Helvetica", 9)
        y_pos = y - 10 * mm
        for condutor in self.mdfe.condutores.all():
            self.c.drawString(self.margin + 2 * mm, y_pos, f"{condutor.nome} - CPF: {self._format_cpf(condutor.cpf)}")
            y_pos -= 5 * mm
            
        return y - height - 5 * mm
        
    def _draw_documents(self):
        """Desenha a lista de documentos vinculados"""
        y = self.height - self.margin - 240 * mm
        
        # Cabeçalho da tabela
        self.c.rect(self.margin, y - 10 * mm, self.width - 2 * self.margin, 10 * mm)
        self.c.setFont("Helvetica-Bold", 10)
        self.c.drawString(self.margin + 2 * mm, y - 7 * mm, "DOCUMENTOS FISCAIS VINCULADOS")
        
        y = y - 10 * mm
        
        # Agrupar por município de descarga
        for municipio in self.mdfe.municipios_descarga.all():
            # Município
            self.c.rect(self.margin, y - 8 * mm, self.width - 2 * self.margin, 8 * mm)
            self.c.setFont("Helvetica-Bold", 9)
            self.c.drawString(self.margin + 2 * mm, y - 5 * mm, f"Município: {municipio.x_mun_descarga} - {municipio.c_mun_descarga}")
            
            y = y - 8 * mm
            
            # Documentos do município
            docs = municipio.docs_vinculados_municipio.all()
            for doc in docs[:10]:  # Limitar a 10 documentos por página
                self.c.rect(self.margin, y - 5 * mm, self.width - 2 * self.margin, 5 * mm)
                self.c.setFont("Helvetica", 8)
                self.c.drawString(self.margin + 2 * mm, y - 3.5 * mm, f"Chave: {doc.chave_documento}")
                y = y - 5 * mm
                
            if docs.count() > 10:
                self.c.drawString(self.margin + 2 * mm, y - 3 * mm, f"... e mais {docs.count() - 10} documento(s)")
                y = y - 5 * mm
                
        return y - 5 * mm
        
    def _draw_totals(self):
        """Desenha os totalizadores"""
        y = self.height - self.margin - 320 * mm
        
        if not hasattr(self.mdfe, 'totais'):
            return y
            
        totais = self.mdfe.totais
        
        # Box
        self.c.rect(self.margin, y - 20 * mm, self.width - 2 * self.margin, 20 * mm)
        
        self.c.setFont("Helvetica-Bold", 10)
        self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "TOTALIZADORES")
        
        self.c.setFont("Helvetica", 9)
        # Linha 1
        if totais.q_cte:
            self.c.drawString(self.margin + 2 * mm, y - 12 * mm, f"Qtd. CT-e: {totais.q_cte}")
        if totais.q_nfe:
            self.c.drawString(self.margin + 40 * mm, y - 12 * mm, f"Qtd. NF-e: {totais.q_nfe}")
            
        # Linha 2
        self.c.drawString(self.margin + 2 * mm, y - 18 * mm, f"Valor Total: R$ {totais.v_carga:,.2f}")
        
        peso_unit = "kg" if totais.c_unid == "01" else "ton"
        self.c.drawString(self.margin + 60 * mm, y - 18 * mm, f"Peso Total: {totais.q_carga:,.2f} {peso_unit}")
        
        return y - 25 * mm
        
    def _draw_additional_info(self):
        """Desenha informações adicionais"""
        y = self.height - self.margin - 350 * mm
        
        if hasattr(self.mdfe, 'adicional'):
            info_adic = self.mdfe.adicional
            
            if info_adic.inf_cpl or info_adic.inf_ad_fisco:
                # Box
                self.c.rect(self.margin, y - 30 * mm, self.width - 2 * self.margin, 30 * mm)
                
                self.c.setFont("Helvetica-Bold", 9)
                self.c.drawString(self.margin + 2 * mm, y - 5 * mm, "INFORMAÇÕES COMPLEMENTARES")
                
                self.c.setFont("Helvetica", 8)
                y_pos = y - 10 * mm
                
                # Informações complementares
                if info_adic.inf_cpl:
                    lines = textwrap.wrap(info_adic.inf_cpl, width=120)
                    for line in lines[:3]:  # Limitar a 3 linhas
                        self.c.drawString(self.margin + 2 * mm, y_pos, line)
                        y_pos -= 4 * mm
                        
                # Informações do fisco
                if info_adic.inf_ad_fisco:
                    self.c.setFont("Helvetica-Bold", 8)
                    self.c.drawString(self.margin + 2 * mm, y_pos, "INFORMAÇÕES DO FISCO:")
                    y_pos -= 4 * mm
                    self.c.setFont("Helvetica", 8)
                    
                    lines = textwrap.wrap(info_adic.inf_ad_fisco, width=120)
                    for line in lines[:2]:  # Limitar a 2 linhas
                        self.c.drawString(self.margin + 2 * mm, y_pos, line)
                        y_pos -= 4 * mm
                        
                return y - 35 * mm
                
        return y
        
    def _draw_footer(self):
        """Desenha o rodapé do DAMDFE"""
        y = 30 * mm
        
        # Linha separadora
        self.c.line(self.margin, y + 5 * mm, self.width - self.margin, y + 5 * mm)
        
        # Protocolo de autorização
        if hasattr(self.mdfe, 'protocolo'):
            protocolo = self.mdfe.protocolo
            self.c.setFont("Helvetica", 8)
            texto_protocolo = f"Protocolo de Autorização: {protocolo.numero_protocolo} - {protocolo.data_recebimento.strftime('%d/%m/%Y %H:%M:%S')}"
            self.c.drawCentredString(self.width / 2, y, texto_protocolo)
        else:
            self.c.setFont("Helvetica-Bold", 10)
            self.c.drawCentredString(self.width / 2, y, "DOCUMENTO NÃO AUTORIZADO")
            
        # Data/hora de impressão
        self.c.setFont("Helvetica", 7)
        self.c.drawString(self.margin, y - 10 * mm, f"Impresso em: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        
    def _generate_qr_code(self):
        """Gera o QR Code do MDF-e"""
        # URL de consulta (exemplo - ajustar conforme ambiente)
        qr_url = f"https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe={self.mdfe.chave}&tpAmb={self.mdfe.identificacao.tp_amb}"
        
        qr = qrcode.QRCode(version=1, box_size=10, border=0)
        qr.add_data(qr_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        return ImageReader(buffer)
        
    def _generate_barcode(self):
        """Gera o código de barras da chave de acesso"""
        # Remover espaços e caracteres não numéricos
        chave_limpa = ''.join(filter(str.isdigit, self.mdfe.chave))
        
        # Gerar código de barras
        code128 = barcode.get_barcode_class('code128')
        barcode_img = code128(chave_limpa, writer=ImageWriter())
        
        buffer = BytesIO()
        barcode_img.write(buffer)
        buffer.seek(0)
        
        return ImageReader(buffer)
        
    def _format_cnpj(self, cnpj):
        """Formata CNPJ para exibição"""
        if not cnpj:
            return ""
        cnpj = ''.join(filter(str.isdigit, cnpj))
        return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:14]}"
        
    def _format_cpf(self, cpf):
        """Formata CPF para exibição"""
        if not cpf:
            return ""
        cpf = ''.join(filter(str.isdigit, cpf))
        return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:11]}"
        
    def _format_chave(self, chave):
        """Formata chave de acesso para exibição"""
        if not chave:
            return ""
        chave = ''.join(filter(str.isdigit, chave))
        # Formatar em grupos de 4 dígitos
        return ' '.join([chave[i:i+4] for i in range(0, len(chave), 4)])


def gerar_damdfe_pdf(mdfe):
    """Função principal para gerar o PDF do DAMDFE"""
    generator = DAMDFEGenerator(mdfe)
    pdf_buffer = generator.generate()
    return pdf_buffer.getvalue()