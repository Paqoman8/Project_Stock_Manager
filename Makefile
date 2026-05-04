# ══════════════════════════════════════════════════════════════════════════════
#  Stock Manager — Makefile
#  Usage : make <commande>   |   make help pour la liste complète
# ══════════════════════════════════════════════════════════════════════════════

.PHONY: setup start stop restart \
        rebuild rebuild-backend rebuild-frontend \
        logs logs-back logs-front \
        status health \
        backup restore seed db-shell db-reset \
        studio shell migrate \
        reset help

# ── Variables ────────────────────────────────────────────────────────────────
BACKUP_DIR  := backups
BACKEND     := stockmanager-backend
FRONTEND    := stockmanager-frontend
POSTGRES    := stockmanager-postgres

# ── Couleurs terminal ─────────────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[0;33m
CYAN   := \033[0;36m
RED    := \033[0;31m
BOLD   := \033[1m
RESET  := \033[0m

# ══════════════════════════════════════════════════════════════════════════════
#  DÉMARRAGE & ARRÊT
# ══════════════════════════════════════════════════════════════════════════════

## setup          : 🚀 Premier lancement — build complet, migrations, seed
setup:
	@echo "$(CYAN)$(BOLD)🔨 Build et démarrage de Stock Manager...$(RESET)"
	docker compose up --build -d
	@echo ""
	@echo "$(GREEN)$(BOLD)✅ Stock Manager est prêt !$(RESET)"
	@echo "$(GREEN)   → Application  : http://localhost:3000$(RESET)"
	@echo "$(GREEN)   → Prisma Studio : http://localhost:5555 (après 'make studio')$(RESET)"
	@echo "$(GREEN)   → Identifiant  : super.admin$(RESET)"
	@echo "$(GREEN)   → Mot de passe : Admin@2026!$(RESET)"
	@echo ""
	@echo "$(YELLOW)💡 make logs pour suivre les logs — make help pour toutes les commandes$(RESET)"

## start          : ▶️  Démarrer les containers (sans rebuild)
start:
	@echo "$(CYAN)▶️  Démarrage des containers...$(RESET)"
	docker compose up -d
	@echo "$(GREEN)✅ Containers démarrés → http://localhost:3000$(RESET)"

## stop           : ⏹️  Arrêter les containers (données conservées)
stop:
	@echo "$(CYAN)⏹️  Arrêt des containers...$(RESET)"
	docker compose down
	@echo "$(GREEN)✅ Containers arrêtés. Les données sont conservées.$(RESET)"

## restart        : 🔄 Redémarrer tous les services
restart:
	@echo "$(CYAN)🔄 Redémarrage des containers...$(RESET)"
	docker compose restart
	@echo "$(GREEN)✅ Containers redémarrés.$(RESET)"

# ══════════════════════════════════════════════════════════════════════════════
#  BUILD & MISE À JOUR DU CODE
# ══════════════════════════════════════════════════════════════════════════════

## rebuild        : 🔨 Rebuilder tous les services après modification du code
rebuild:
	@echo "$(CYAN)🔨 Rebuild complet (backend + frontend)...$(RESET)"
	docker compose up --build -d
	@echo "$(GREEN)✅ Rebuild terminé → http://localhost:3000$(RESET)"

## rebuild-back   : 🔨 Rebuilder uniquement le backend
rebuild-back:
	@echo "$(CYAN)🔨 Rebuild backend...$(RESET)"
	docker compose up --build -d backend
	@echo "$(GREEN)✅ Backend rebuild terminé.$(RESET)"

## rebuild-front  : 🔨 Rebuilder uniquement le frontend
rebuild-front:
	@echo "$(CYAN)🔨 Rebuild frontend...$(RESET)"
	docker compose up --build -d frontend
	@echo "$(GREEN)✅ Frontend rebuild terminé.$(RESET)"

# ══════════════════════════════════════════════════════════════════════════════
#  MONITORING & VÉRIFICATION
# ══════════════════════════════════════════════════════════════════════════════

## logs           : 📋 Suivre tous les logs en temps réel (Ctrl+C pour quitter)
logs:
	docker compose logs -f

## logs-back      : 📋 Logs du backend uniquement
logs-back:
	docker compose logs -f backend

## logs-front     : 📋 Logs du frontend uniquement
logs-front:
	docker compose logs -f frontend

## status         : 📊 État des containers (ports, statut, santé)
status:
	@echo "$(CYAN)$(BOLD)📊 État des containers :$(RESET)"
	@echo ""
	docker compose ps
	@echo ""

## health         : 🏥 Vérifier que l'API backend répond correctement
health:
	@echo "$(CYAN)🏥 Vérification de santé...$(RESET)"
	@echo ""
	@echo "  Containers :"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps
	@echo ""
	@echo "  API backend (/api/health) :"
	@curl -s http://localhost:5001/api/health | python3 -m json.tool 2>/dev/null \
		|| curl -s http://localhost:5001/api/health \
		|| echo "$(RED)  ✗ Backend inaccessible$(RESET)"
	@echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  BASE DE DONNÉES
# ══════════════════════════════════════════════════════════════════════════════

## backup         : 💾 Sauvegarder la DB → backups/backup_YYYYMMDD_HHMMSS.sql
backup:
	@mkdir -p $(BACKUP_DIR)
	@FILE="$(BACKUP_DIR)/backup_$$(date +%Y%m%d_%H%M%S).sql"; \
	docker exec $(POSTGRES) pg_dump --clean --if-exists -U admin gstock_db > "$$FILE" && \
	echo "$(GREEN)✅ Sauvegarde créée : $$FILE$(RESET)" && \
	echo "$(YELLOW)   Taille : $$(du -sh $$FILE | cut -f1)$(RESET)"

## restore        : ♻️  Restaurer la DB — usage : make restore FILE=backups/backup_xxx.sql
restore:
	@if [ -z "$(FILE)" ]; then \
		echo "$(YELLOW)⚠️  Préciser le fichier : make restore FILE=backups/backup_xxx.sql$(RESET)"; \
		echo "$(YELLOW)   Fichiers disponibles :$(RESET)"; \
		ls -1t $(BACKUP_DIR)/*.sql 2>/dev/null | head -10 || echo "   Aucune sauvegarde trouvée."; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "$(RED)✗ Fichier introuvable : $(FILE)$(RESET)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)⚠️  Restauration depuis : $(FILE)$(RESET)"
	@echo "$(YELLOW)   Les données actuelles seront écrasées. Continuer ? [y/N]$(RESET)" && read ans && [ $${ans:-N} = y ]
	@echo "$(CYAN)🧹 Nettoyage du schéma actuel...$(RESET)"
	docker exec -i $(POSTGRES) psql -U admin -d gstock_db \
		-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO admin; GRANT ALL ON SCHEMA public TO public;"
	@echo "$(CYAN)📥 Restauration des données...$(RESET)"
	docker exec -i $(POSTGRES) psql -U admin -d gstock_db < "$(FILE)"
	@echo "$(GREEN)✅ Restauration terminée depuis : $(FILE)$(RESET)"

## seed           : 🌱 Rejouer le seed (rôles, Hub Central, super.admin)
seed:
	@echo "$(CYAN)🌱 Exécution du seed...$(RESET)"
	docker exec -it $(BACKEND) npx prisma db seed
	@echo "$(GREEN)✅ Seed terminé.$(RESET)"

## db-reset       : 🗑️  Réinitialiser la DB (migrations + seed) sans toucher au code
db-reset:
	@echo "$(YELLOW)⚠️  La base de données va être réinitialisée. Les données seront perdues.$(RESET)"
	@echo "$(YELLOW)   Créer une sauvegarde avant ? (make backup)$(RESET)"
	@echo "$(YELLOW)   Continuer ? [y/N]$(RESET)" && read ans && [ $${ans:-N} = y ]
	docker compose stop backend
	docker compose rm -f backend
	docker volume rm $$(docker compose config --volumes | grep postgres) 2>/dev/null || \
		docker volume rm $(shell basename $(CURDIR))_postgres-data 2>/dev/null || true
	docker compose up -d postgres
	@echo "$(CYAN)⏳ Attente de PostgreSQL...$(RESET)"
	@sleep 5
	docker compose up -d backend
	@echo "$(GREEN)✅ Base de données réinitialisée.$(RESET)"

## db-shell       : 🐘 Ouvrir un shell PostgreSQL (psql)
db-shell:
	@echo "$(CYAN)🐘 Connexion à PostgreSQL (\\q pour quitter)...$(RESET)"
	docker exec -it $(POSTGRES) psql -U admin -d gstock_db

# ══════════════════════════════════════════════════════════════════════════════
#  DÉVELOPPEMENT & OUTILS
# ══════════════════════════════════════════════════════════════════════════════

## studio         : 🔬 Lancer Prisma Studio → http://localhost:5555
studio:
	@echo "$(CYAN)🔬 Lancement de Prisma Studio...$(RESET)"
	@echo "$(GREEN)   → Ouvrir : http://localhost:5555$(RESET)"
	@echo "$(YELLOW)   Ctrl+C pour arrêter$(RESET)"
	@echo ""
	docker exec -it $(BACKEND) npx prisma studio --port 5555 --browser none

## shell          : 💻 Ouvrir un shell dans le container backend
shell:
	@echo "$(CYAN)💻 Shell backend (exit pour quitter)...$(RESET)"
	docker exec -it $(BACKEND) sh

## migrate        : 🗃️  Appliquer les migrations Prisma en attente
migrate:
	@echo "$(CYAN)🗃️  Application des migrations...$(RESET)"
	docker exec -it $(BACKEND) npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées.$(RESET)"

## migrate-status : 🗃️  Vérifier l'état des migrations
migrate-status:
	docker exec -it $(BACKEND) npx prisma migrate status

# ══════════════════════════════════════════════════════════════════════════════
#  RESET & NETTOYAGE
# ══════════════════════════════════════════════════════════════════════════════

## reset          : ⚠️  Tout effacer (containers + données) et repartir de zéro
reset:
	@echo "$(RED)$(BOLD)⚠️  ATTENTION : toutes les données seront supprimées.$(RESET)"
	@echo "$(YELLOW)   Conseil : lancez 'make backup' avant de continuer.$(RESET)"
	@echo "$(YELLOW)   Continuer quand même ? [y/N]$(RESET)" && read ans && [ $${ans:-N} = y ]
	docker compose down -v
	docker compose up --build -d
	@echo "$(GREEN)✅ Reset terminé — base de données réinitialisée.$(RESET)"

# ══════════════════════════════════════════════════════════════════════════════
#  AIDE
# ══════════════════════════════════════════════════════════════════════════════

## help           : ❓ Afficher cette aide
help:
	@echo ""
	@echo "$(CYAN)$(BOLD)Stock Manager — Commandes disponibles$(RESET)"
	@echo "$(CYAN)══════════════════════════════════════$(RESET)"
	@echo ""
	@echo "$(BOLD)  DÉMARRAGE & ARRÊT$(RESET)"
	@grep -E '^## (setup|start|stop|restart)' Makefile | sed 's/^## /    make /'
	@echo ""
	@echo "$(BOLD)  BUILD & MISE À JOUR DU CODE$(RESET)"
	@grep -E '^## rebuild' Makefile | sed 's/^## /    make /'
	@echo ""
	@echo "$(BOLD)  MONITORING$(RESET)"
	@grep -E '^## (logs|status|health)' Makefile | sed 's/^## /    make /'
	@echo ""
	@echo "$(BOLD)  BASE DE DONNÉES$(RESET)"
	@grep -E '^## (backup|restore|seed|db-)' Makefile | sed 's/^## /    make /'
	@echo ""
	@echo "$(BOLD)  DÉVELOPPEMENT$(RESET)"
	@grep -E '^## (studio|shell|migrate)' Makefile | sed 's/^## /    make /'
	@echo ""
	@echo "$(BOLD)  RESET$(RESET)"
	@grep -E '^## reset' Makefile | sed 's/^## /    make /'
	@echo ""
