import csv
from io import StringIO

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework import status


def csv_response(queryset, serializer_class, filename):
    """Return CSV as an :class:`HttpResponse` for the given queryset."""
    if not queryset.exists():
        return Response({"error": "Não há dados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    serializer = serializer_class(queryset, many=True)
    data = serializer.data

    if not data:
        return Response({"error": "Não há dados serializados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    field_names = list(data[0].keys())
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=field_names)
    writer.writeheader()
    writer.writerows(data)

    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
