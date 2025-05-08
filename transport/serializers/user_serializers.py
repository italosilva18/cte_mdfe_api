# transport/serializers/user_serializers.py

from rest_framework import serializers
from django.contrib.auth.models import User

# =======================================
# === Serializers para Usuários (User) ===
# =======================================

class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer para atualizar o perfil do usuário logado (PATCH)."""
    # Campo de senha não é obrigatório para atualização, apenas se for mudar
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}, help_text="Opcional. Defina para alterar a senha.")
    password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}, help_text="Confirmação da nova senha.")

    class Meta:
        model = User
        # Campos permitidos para atualização pelo próprio usuário
        fields = ['first_name', 'last_name', 'email', 'password', 'password_confirm']
        extra_kwargs = {
            # Nenhum campo é estritamente obrigatório no PATCH/PUT vindo do 'me' endpoint
            'email': {'required': False},
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate(self, data):
        """Valida a confirmação de senha e se o email já existe."""
        password = data.get('password')
        password_confirm = data.pop('password_confirm', None) # Remove confirmação dos dados a salvar

        # Validação de senha
        if password: # Se uma nova senha foi fornecida
            if not password_confirm:
                raise serializers.ValidationError({"password_confirm": "Confirmação de senha é obrigatória ao definir uma nova senha."})
            if password != password_confirm:
                raise serializers.ValidationError({"password_confirm": "As senhas não coincidem."})
        elif password_confirm:
             # Se a confirmação foi enviada mas a senha não (ou em branco)
             raise serializers.ValidationError({"password": "Senha é obrigatória se a confirmação for fornecida."})

        # Validação de email (verifica se outro usuário já tem esse email)
        email = data.get('email')
        if email and self.instance: # Apenas na atualização (instance existe)
            if User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError({'email': 'Este endereço de e-mail já está em uso por outro usuário.'})

        return data

    def update(self, instance, validated_data):
        """Atualiza a instância do usuário."""
        # Trata a senha separadamente usando set_password para hashing
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Atualiza os outros campos
        instance = super().update(instance, validated_data)
        instance.save()
        return instance


class UserSerializer(serializers.ModelSerializer):
    """Serializer para CRUD completo de Usuários (usado pelo UserViewSet - Admin)."""
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'}, help_text="Obrigatório na criação. Opcional na atualização.")

    class Meta:
        model = User
        # Define os campos a serem expostos/editados pela API de admin
        fields = ['id', 'username', 'password', 'first_name', 'last_name', 'email',
                  'is_staff', 'is_active', 'is_superuser',
                  'date_joined', 'last_login']
        read_only_fields = ['id', 'date_joined', 'last_login']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}, # Não obrigatório em GET/PATCH
            'username': {'required': True}, # Username sempre obrigatório
            'email': {'required': False}, # Email não é obrigatório por padrão no Django User
        }

    def validate_email(self, value):
        """Validação extra para garantir unicidade de email na criação/atualização via admin."""
        if not value: # Permite email vazio se 'required=False'
            return value

        # Verifica se o email já existe para outro usuário
        query = User.objects.filter(email__iexact=value)
        if self.instance: # Se for update, exclui o próprio usuário da checagem
             query = query.exclude(pk=self.instance.pk)
        if query.exists():
             raise serializers.ValidationError("Este endereço de e-mail já está em uso.")
        return value

    def create(self, validated_data):
        """Cria um novo usuário."""
        # Garante que a senha seja obrigatória na criação
        if 'password' not in validated_data or not validated_data['password']:
            raise serializers.ValidationError({'password': 'Este campo é obrigatório na criação.'})

        # Usa create_user para garantir o hash correto da senha
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            is_staff=validated_data.get('is_staff', False),
            is_active=validated_data.get('is_active', True),
            # Cuidado ao expor/permitir 'is_superuser' via API
            is_superuser=validated_data.get('is_superuser', False)
        )
        return user

    def update(self, instance, validated_data):
        """Atualiza um usuário existente."""
        # Atualiza a senha SE ela for fornecida e não estiver vazia
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Atualiza outros campos (chama o método padrão para o resto)
        instance = super().update(instance, validated_data)
        instance.save()
        return instance