# transport/services/dacte_generator.py

import io
import qrcode
from decimal import Decimal
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, 
    Image, PageBreak, KeepTogether
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from barcode import Code128
from barcode.writer import ImageWriter
import tempfile
import os
import logging

logger = logging.getLogger(__name__)


class DACTEGenerator:
    """Gerador de DACTE (Documento Auxiliar do Conhecimento de Transporte Eletrônico)."""
    
    def __init__(self, cte):
        self.cte = cte
        self.width, self.height = A4
        self.margin = 10 * mm
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        
    def _setup_styles(self):
        """Configura estilos customizados para o documento."""
        # Estilo para títulos de seção
        self.styles.add(ParagraphStyle(
            name='SectionTitle',
            parent=self.styles['Heading3'],
            fontSize=9,
            textColor=colors.black,
            alignment=TA_CENTER,
            spaceAfter=2*mm,
            fontName='Helvetica-Bold'
        ))
        
        # Estilo para campos
        self.styles.add(ParagraphStyle(
            name='FieldLabel',
            parent=self.styles['Normal'],
            fontSize=7,
            textColor=colors.black,
            alignment=TA_LEFT,
            fontName='Helvetica'
        ))
        
        # Estilo para valores
        self.styles.add(ParagraphStyle(
            name='FieldValue',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.black,
            alignment=TA_LEFT,
            fontName='Helvetica-Bold'
        ))
        
        # Estilo para o número do CT-e
        self.styles.add(ParagraphStyle(
            name='CTeNumber',
            parent=self.styles['Heading1'],
            fontSize=14,
            textColor=colors.black,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
    def _format_cnpj_cpf(self, value):
        """Formata CNPJ ou CPF."""
        if not value:
            return ''
        value = str(value)
        if len(value) == 14:  # CNPJ
            return f"{value[:2]}.{value[2:5]}.{value[5:8]}/{value[8:12]}-{value[12:]}"
        elif len(value) == 11:  # CPF
            return f"{value[:3]}.{value[3:6]}.{value[6:9]}-{value[9:]}"
        return value
    
    def _format_cep(self, value):
        """Formata CEP."""
        if not value:
            return ''
        value = str(value)
        if len(value) == 8:
            return f"{value[:5]}-{value[5:]}"
        return value
    
    def _format_money(self, value):
        """Formata valor monetário."""
        if value is None:
            return 'R$ 0,00'
        try:
            value = float(value)
            return f"R$ {value:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
        except:
            return 'R$ 0,00'
    
    def _generate_qrcode(self):
        """Gera o QR Code do CT-e."""
        try:
            qr_url = None
            if hasattr(self.cte, 'suplementar') and self.cte.suplementar:
                qr_url = self.cte.suplementar.qr_code_url
            
            if not qr_url:
                # URL padrão se não houver no banco
                qr_url = f"https://nfe.fazenda.gov.br/portal/consultacte.aspx?chave={self.cte.chave}"
            
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=3,
                border=1,
            )
            qr.add_data(qr_url)
            qr.make(fit=True)
            
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Salva em arquivo temporário
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            img.save(temp_file.name)
            temp_file.close()
            
            return temp_file.name
        except Exception as e:
            logger.error(f"Erro ao gerar QR Code: {e}")
            return None
    
    def _generate_barcode(self):
        """Gera o código de barras da chave de acesso."""
        try:
            # Remove espaços e caracteres especiais da chave
            chave_limpa = ''.join(filter(str.isdigit, self.cte.chave))
            
            # Gera o código de barras
            barcode = Code128(chave_limpa, writer=ImageWriter())
            
            # Salva em arquivo temporário
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            barcode.write(temp_file, options={
                'module_width': 0.2,
                'module_height': 8,
                'font_size': 8,
                'text_distance': 2,
                'quiet_zone': 2
            })
            temp_file.close()
            
            return temp_file.name
        except Exception as e:
            logger.error(f"Erro ao gerar código de barras: {e}")
            return None
    
    def _create_header(self):
        """Cria o cabeçalho do DACTE."""
        elements = []
        
        # Tabela principal do cabeçalho
        header_data = []
        
        # Linha 1: Título e informações básicas
        identificacao = self.cte.identificacao
        emitente = self.cte.emitente
        
        # Tipo de CT-e
        tipos_cte = {
            0: 'Normal',
            1: 'Complementar',
            2: 'Anulação',
            3: 'Substituto'
        }
        tipo_cte_desc = tipos_cte.get(identificacao.tipo_cte, 'Normal')
        
        # Modal
        modais = {
            '01': 'Rodoviário',
            '02': 'Aéreo', 
            '03': 'Aquaviário',
            '04': 'Ferroviário',
            '05': 'Dutoviário',
            '06': 'Multimodal'
        }
        modal_desc = modais.get(identificacao.modal, 'Rodoviário')
        
        # Primeira linha com dados do emitente e título
        row1 = [
            [
                Paragraph(f"<b>{emitente.razao_social}</b>", self.styles['FieldValue']),
                Paragraph(f"CNPJ: {self._format_cnpj_cpf(emitente.cnpj)}", self.styles['FieldLabel']),
                Paragraph(f"IE: {emitente.ie or ''}", self.styles['FieldLabel']),
                Paragraph(f"{emitente.logradouro}, {emitente.numero}", self.styles['FieldLabel']),
                Paragraph(f"{emitente.bairro} - {emitente.nome_municipio}/{emitente.uf}", self.styles['FieldLabel']),
                Paragraph(f"CEP: {self._format_cep(emitente.cep)} - Fone: {emitente.telefone or ''}", self.styles['FieldLabel']),
            ],
            Paragraph("<b>DACTE</b><br/>Documento Auxiliar do<br/>Conhecimento de Transporte<br/>Eletrônico", 
                     self.styles['SectionTitle']),
            [
                Paragraph(f"<b>CT-e</b>", self.styles['CTeNumber']),
                Paragraph(f"<b>Nº {identificacao.numero:09d}</b>", self.styles['CTeNumber']),
                Paragraph(f"<b>Série {identificacao.serie:03d}</b>", self.styles['FieldValue']),
                Spacer(1, 2*mm),
                Paragraph(f"Tipo: {tipo_cte_desc}", self.styles['FieldLabel']),
                Paragraph(f"Modal: {modal_desc}", self.styles['FieldLabel']),
            ]
        ]
        
        header_data.append(row1)
        
        # Cria a tabela do cabeçalho
        header_table = Table(header_data, colWidths=[100*mm, 50*mm, 40*mm])
        header_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        elements.append(header_table)
        elements.append(Spacer(1, 3*mm))
        
        # Código de barras da chave
        barcode_file = self._generate_barcode()
        if barcode_file:
            try:
                # Cria tabela com chave e código de barras
                chave_formatada = ' '.join([self.cte.chave[i:i+4] for i in range(0, 44, 4)])
                
                barcode_data = [
                    [Paragraph(f"<b>CHAVE DE ACESSO</b>", self.styles['FieldLabel'])],
                    [Paragraph(chave_formatada, self.styles['FieldValue'])],
                    [Image(barcode_file, width=170*mm, height=15*mm)]
                ]
                
                barcode_table = Table(barcode_data, colWidths=[190*mm])
                barcode_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                    ('TOPPADDING', (0, 0), (-1, -1), 2),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ]))
                
                elements.append(barcode_table)
                elements.append(Spacer(1, 3*mm))
                
                # Remove arquivo temporário
                os.unlink(barcode_file)
            except Exception as e:
                logger.error(f"Erro ao adicionar código de barras: {e}")
        
        # Protocolo de autorização
        if hasattr(self.cte, 'protocolo') and self.cte.protocolo:
            protocolo = self.cte.protocolo
            data_autorizacao = protocolo.data_recebimento.strftime('%d/%m/%Y %H:%M:%S')
            
            protocolo_data = [[
                Paragraph(f"<b>Protocolo de Autorização:</b> {protocolo.numero_protocolo} - {data_autorizacao}",
                         self.styles['FieldValue'])
            ]]
            
            protocolo_table = Table(protocolo_data, colWidths=[190*mm])
            protocolo_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            
            elements.append(protocolo_table)
            elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_transport_info(self):
        """Cria a seção de informações do transporte."""
        elements = []
        identificacao = self.cte.identificacao
        
        # Título da seção
        elements.append(Paragraph("<b>INFORMAÇÕES DO TRANSPORTE</b>", self.styles['SectionTitle']))
        
        # Dados do transporte
        transport_data = [
            [
                Paragraph("CFOP", self.styles['FieldLabel']),
                Paragraph("Natureza da Operação", self.styles['FieldLabel']),
                Paragraph("Início da Prestação", self.styles['FieldLabel']),
                Paragraph("Fim da Prestação", self.styles['FieldLabel']),
            ],
            [
                Paragraph(identificacao.cfop, self.styles['FieldValue']),
                Paragraph(identificacao.natureza_operacao, self.styles['FieldValue']),
                Paragraph(f"{identificacao.nome_mun_ini}/{identificacao.uf_ini}", self.styles['FieldValue']),
                Paragraph(f"{identificacao.nome_mun_fim}/{identificacao.uf_fim}", self.styles['FieldValue']),
            ]
        ]
        
        transport_table = Table(transport_data, colWidths=[30*mm, 80*mm, 40*mm, 40*mm])
        transport_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        elements.append(transport_table)
        elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_sender_receiver_info(self):
        """Cria a seção de remetente e destinatário."""
        elements = []
        
        # Título
        elements.append(Paragraph("<b>REMETENTE / DESTINATÁRIO</b>", self.styles['SectionTitle']))
        
        remetente = self.cte.remetente
        destinatario = self.cte.destinatario
        
        # Dados do remetente
        if remetente:
            rem_data = [
                [
                    Paragraph("REMETENTE", self.styles['FieldLabel']),
                    Paragraph("CNPJ/CPF", self.styles['FieldLabel']),
                    Paragraph("IE", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(remetente.razao_social or '', self.styles['FieldValue']),
                    Paragraph(self._format_cnpj_cpf(remetente.cnpj or remetente.cpf), self.styles['FieldValue']),
                    Paragraph(remetente.ie or '', self.styles['FieldValue']),
                ],
                [
                    Paragraph("Endereço", self.styles['FieldLabel']),
                    Paragraph("Município/UF", self.styles['FieldLabel']),
                    Paragraph("CEP", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(f"{remetente.logradouro or ''}, {remetente.numero or ''}", self.styles['FieldValue']),
                    Paragraph(f"{remetente.nome_municipio or ''}/{remetente.uf or ''}", self.styles['FieldValue']),
                    Paragraph(self._format_cep(remetente.cep), self.styles['FieldValue']),
                ]
            ]
            
            rem_table = Table(rem_data, colWidths=[100*mm, 60*mm, 30*mm])
            rem_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
                ('SPAN', (0, 0), (0, 1)),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            elements.append(rem_table)
            elements.append(Spacer(1, 2*mm))
        
        # Dados do destinatário
        if destinatario:
            dest_data = [
                [
                    Paragraph("DESTINATÁRIO", self.styles['FieldLabel']),
                    Paragraph("CNPJ/CPF", self.styles['FieldLabel']),
                    Paragraph("IE", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(destinatario.razao_social or '', self.styles['FieldValue']),
                    Paragraph(self._format_cnpj_cpf(destinatario.cnpj or destinatario.cpf), self.styles['FieldValue']),
                    Paragraph(destinatario.ie or '', self.styles['FieldValue']),
                ],
                [
                    Paragraph("Endereço", self.styles['FieldLabel']),
                    Paragraph("Município/UF", self.styles['FieldLabel']),
                    Paragraph("CEP", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(f"{destinatario.logradouro or ''}, {destinatario.numero or ''}", self.styles['FieldValue']),
                    Paragraph(f"{destinatario.nome_municipio or ''}/{destinatario.uf or ''}", self.styles['FieldValue']),
                    Paragraph(self._format_cep(destinatario.cep), self.styles['FieldValue']),
                ]
            ]
            
            dest_table = Table(dest_data, colWidths=[100*mm, 60*mm, 30*mm])
            dest_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
                ('SPAN', (0, 0), (0, 1)),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            elements.append(dest_table)
            elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_values_section(self):
        """Cria a seção de valores do serviço."""
        elements = []
        
        # Título
        elements.append(Paragraph("<b>VALORES DO SERVIÇO</b>", self.styles['SectionTitle']))
        
        prestacao = self.cte.prestacao if hasattr(self.cte, 'prestacao') else None
        
        if prestacao:
            # Valores principais
            values_data = [
                [
                    Paragraph("Valor Total da Prestação", self.styles['FieldLabel']),
                    Paragraph("Valor a Receber", self.styles['FieldLabel']),
                    Paragraph("Modalidade", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(self._format_money(prestacao.valor_total_prestado), self.styles['FieldValue']),
                    Paragraph(self._format_money(prestacao.valor_recebido), self.styles['FieldValue']),
                    Paragraph(self.cte.modalidade or 'N/I', self.styles['FieldValue']),
                ]
            ]
            
            values_table = Table(values_data, colWidths=[70*mm, 70*mm, 50*mm])
            values_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            elements.append(values_table)
            elements.append(Spacer(1, 2*mm))
            
            # Componentes do valor
            if prestacao.componentes.exists():
                comp_data = [
                    [Paragraph("Componente", self.styles['FieldLabel']), 
                     Paragraph("Valor", self.styles['FieldLabel'])]
                ]
                
                for comp in prestacao.componentes.all():
                    comp_data.append([
                        Paragraph(comp.nome, self.styles['FieldValue']),
                        Paragraph(self._format_money(comp.valor), self.styles['FieldValue'])
                    ])
                
                comp_table = Table(comp_data, colWidths=[140*mm, 50*mm])
                comp_table.setStyle(TableStyle([
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('TOPPADDING', (0, 0), (-1, -1), 2),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                    ('LEFTPADDING', (0, 0), (-1, -1), 3),
                ]))
                
                elements.append(comp_table)
                elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_cargo_info(self):
        """Cria a seção de informações da carga."""
        elements = []
        
        carga = self.cte.carga if hasattr(self.cte, 'carga') else None
        
        if carga:
            elements.append(Paragraph("<b>INFORMAÇÕES DA CARGA</b>", self.styles['SectionTitle']))
            
            cargo_data = [
                [
                    Paragraph("Produto Predominante", self.styles['FieldLabel']),
                    Paragraph("Valor Total da Carga", self.styles['FieldLabel']),
                    Paragraph("Outras Características", self.styles['FieldLabel']),
                ],
                [
                    Paragraph(carga.produto_predominante or '', self.styles['FieldValue']),
                    Paragraph(self._format_money(carga.valor_carga), self.styles['FieldValue']),
                    Paragraph(carga.outras_caracteristicas or '', self.styles['FieldValue']),
                ]
            ]
            
            cargo_table = Table(cargo_data, colWidths=[80*mm, 50*mm, 60*mm])
            cargo_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            elements.append(cargo_table)
            
            # Quantidades
            if carga.quantidades.exists():
                elements.append(Spacer(1, 2*mm))
                
                qty_data = [
                    [Paragraph("Unidade", self.styles['FieldLabel']),
                     Paragraph("Tipo Medida", self.styles['FieldLabel']),
                     Paragraph("Quantidade", self.styles['FieldLabel'])]
                ]
                
                unidades = {
                    '00': 'M³', '01': 'KG', '02': 'TON',
                    '03': 'UN', '04': 'L', '05': 'MMBTU'
                }
                
                for qty in carga.quantidades.all():
                    qty_data.append([
                        Paragraph(unidades.get(qty.codigo_unidade, qty.codigo_unidade), self.styles['FieldValue']),
                        Paragraph(qty.tipo_medida, self.styles['FieldValue']),
                        Paragraph(f"{qty.quantidade:,.4f}", self.styles['FieldValue'])
                    ])
                
                qty_table = Table(qty_data, colWidths=[40*mm, 100*mm, 50*mm])
                qty_table.setStyle(TableStyle([
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('TOPPADDING', (0, 0), (-1, -1), 2),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                    ('LEFTPADDING', (0, 0), (-1, -1), 3),
                ]))
                
                elements.append(qty_table)
            
            elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_obs_section(self):
        """Cria a seção de observações."""
        elements = []
        
        complemento = self.cte.complemento if hasattr(self.cte, 'complemento') else None
        
        if complemento and complemento.x_obs:
            elements.append(Paragraph("<b>OBSERVAÇÕES</b>", self.styles['SectionTitle']))
            
            obs_data = [[Paragraph(complemento.x_obs, self.styles['FieldValue'])]]
            
            obs_table = Table(obs_data, colWidths=[190*mm])
            obs_table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            elements.append(obs_table)
            elements.append(Spacer(1, 3*mm))
        
        return elements
    
    def _create_footer(self):
        """Cria o rodapé com QR Code."""
        elements = []
        
        # QR Code
        qr_file = self._generate_qrcode()
        if qr_file:
            footer_data = [[
                Paragraph("Consulte em https://nfe.fazenda.gov.br/portal", self.styles['FieldLabel']),
                Image(qr_file, width=30*mm, height=30*mm)
            ]]
            
            footer_table = Table(footer_data, colWidths=[160*mm, 30*mm])
            footer_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            
            elements.append(footer_table)
            
            # Remove arquivo temporário
            try:
                os.unlink(qr_file)
            except:
                pass
        
        return elements
    
    def generate(self):
        """Gera o PDF do DACTE e retorna os bytes."""
        # Buffer para o PDF
        buffer = io.BytesIO()
        
        # Cria o documento
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=self.margin,
            leftMargin=self.margin,
            topMargin=self.margin,
            bottomMargin=self.margin,
            title=f"DACTE - {self.cte.chave}"
        )
        
        # Lista de elementos do documento
        elements = []
        
        # Adiciona as seções
        elements.extend(self._create_header())
        elements.extend(self._create_transport_info())
        elements.extend(self._create_sender_receiver_info())
        elements.extend(self._create_values_section())
        elements.extend(self._create_cargo_info())
        elements.extend(self._create_obs_section())
        elements.extend(self._create_footer())
        
        # Constrói o PDF
        try:
            doc.build(elements)
            buffer.seek(0)
            return buffer.getvalue()
        except Exception as e:
            logger.error(f"Erro ao gerar PDF: {e}")
            raise
        finally:
            buffer.close()


def gerar_dacte_pdf(cte):
    """Função principal para gerar o DACTE."""
    try:
        generator = DACTEGenerator(cte)
        return generator.generate()
    except Exception as e:
        logger.error(f"Erro ao gerar DACTE para CT-e {cte.chave}: {e}")
        raise