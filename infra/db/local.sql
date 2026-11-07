-- Local only (compose.yaml): passwords for the two roles. Never run against Neon, where each password is a secret.
alter role insyte_owner password 'insyte_owner_local';
alter role insyte_app password 'insyte_app_local';
