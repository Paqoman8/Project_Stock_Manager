.PHONY: setup start stop restart logs reset help

# Couleurs terminal
GREEN  := \033[0;32m
YELLOW := \033[0;33m
CYAN   := \033[0;36m
RESET  := \033[0m

## setup  : Premier lancement — build complet + migrations + seed (à faire une seule fois)
setup:
	@echo "$(CYAN)🔨 Build et démarrage de Stock Manager...$(RESET)"
	docker compose up --build -d
	@echo ""
	@echo "$(GREEN)✅ Stock Manager est prêt !$(RESET)"
	@echo "$(GREEN)   → Application  : http://localhost:3000$(RESET)"
	@echo "$(GREEN)   → Identifiant  : super.admin$(RESET)"
	@echo "$(GREEN)   → Mot de passe : Admin@2026!$(RESET)"
	@echo ""
	@echo "$(YELLOW)💡 Conseil : lancez 'make logs' pour suivre les logs en temps réel.$(RESET)"

## start  : Démarrer les containers (sans rebuild)
start:
	docker compose up -d

## stop   : Arrêter les containers (les données sont conservées)
stop:
	docker compose down

## restart : Redémarrer tous les services
restart:
	docker compose restart

## logs   : Suivre les logs en temps réel (Ctrl+C pour quitter)
logs:
	docker compose logs -f

## reset  : ⚠️  Tout effacer (containers + base de données) et repartir de zéro
reset:
	@echo "$(YELLOW)⚠️  Cette commande va supprimer toutes les données. Continuer ? [y/N]$(RESET)" && read ans && [ $${ans:-N} = y ]
	docker compose down -v
	docker compose up --build -d
	@echo "$(GREEN)✅ Reset terminé — base de données réinitialisée.$(RESET)"

## help   : Afficher cette aide
help:
	@echo ""
	@echo "$(CYAN)Stock Manager — Commandes disponibles$(RESET)"
	@echo "────────────────────────────────────"
	@grep -E '^## ' Makefile | sed 's/## /  make /'
	@echo ""
