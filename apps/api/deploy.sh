#!/bin/bash
# Load environment variables from .env file
set -a
source .env
set +a

sam build && sam deploy \
  --parameter-overrides \
    "ENDPOINT=$DB_ENDPOINT" \
    "DATABASE=$DB_DATABASE" \
    "USERNAME=$DB_USERNAME" \
    "PASSWORD=$DB_PASSWORD" \
    "CardsJsonUrl=https://d2hxvzw7msbtvt.cloudfront.net/cards.json"
