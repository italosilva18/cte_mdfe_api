from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('transport', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlertaSistema',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('prioridade', models.CharField(max_length=10, choices=[('alta','Alta'),('media','Média'),('baixa','Baixa')])),
                ('data_hora', models.DateTimeField(auto_now_add=True)),
                ('tipo', models.CharField(max_length=60, blank=True)),
                ('mensagem', models.TextField()),
                ('dados_adicionais', models.JSONField(null=True, blank=True)),
                ('modulo', models.CharField(max_length=60, blank=True)),
                ('usuario', models.CharField(max_length=60, blank=True)),
                ('referencia', models.CharField(max_length=60, blank=True)),
            ],
            options={
                'verbose_name': 'Alerta do Sistema',
                'verbose_name_plural': 'Alertas do Sistema',
                'ordering': ['-data_hora'],
            },
        ),
    ]

