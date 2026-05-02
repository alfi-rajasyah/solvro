# Solvro - Solution-to-Project Lifecycle Engine

Solvro is a specialized project management platform designed to bridge the gap between **Solution Design** and **Project Implementation**. By providing a unified workflow for Solution Architects (SAs) and Technical Account Managers (TAMs), Solvro ensures data integrity, reduces manual overhead, and optimizes the customer success lifecycle.

## 🚀 Overview

The transition from solution blueprints to technical execution is often fragmented. Solvro solves this by providing a secure ingestion port for technical designs and a comprehensive dashboard for project tracking, including Kanban, Gantt, and Timeline views.

## ✨ Key Features

- **Secure SA Ingestion Port:** REST API/Webhook to receive and validate technical design blueprints automatically.
- **TAM Dashboard:** A high-speed interface (React/HTMX) featuring:
    - **Kanban Boards:** Visual task management with drag-and-drop.
    - **Gantt Charts:** Dependency tracking and schedule management.
    - **Timeline View:** Linear visualization of project phases.
- **Centralized Repository:** PostgreSQL-backed storage for all technical requirements with document version control.
- **Reporting & Analytics:** Real-time project health metrics, resource utilization, and stakeholder reports.
- **RBAC Security:** Role-based access control for SAs, TAMs, and Project Stakeholders.

## 🏗️ Architecture

Solvro follows a 3-tier client-server architecture:

1.  **Frontend:** React SPA with TailwindCSS and HTMX for dynamic server-rendered components.
2.  **Backend:** RESTful API (Node.js/FastAPI) with a dedicated secure ingestion gateway.
3.  **Database:** PostgreSQL 15+ (Relational data + JSONB for flexible blueprint storage).

## 🛠️ Tech Stack

- **Frontend:** React, HTMX, TailwindCSS
- **Backend:** Node.js or Python (FastAPI)
- **Database:** PostgreSQL 15+
- **DevOps:** Docker, Docker Compose
- **Security:** JWT Authentication, TLS 1.2+, AES-256 Encryption

## 📈 Success Metrics

- **Adoption:** 90% user adoption within 2 months of deployment.
- **Accuracy:** 75% reduction in manual data entry errors.
- **Savings:** 50% reduction in third-party project management tool costs by end of 2026.

## 📋 User Stories

- **Solution Architect:** "I want to export my technical blueprints directly into Solvro so information is accurately transferred to the implementation team."
- **Technical Account Manager:** "I want to manage daily tasks and project health in a centralized dashboard."
- **Stakeholder:** "I want to generate detailed reports to make informed project decisions."

## 🚦 Getting Started (Development)

### Prerequisites
- Docker & Docker Compose

### **Installation**
1. Oneliner:
   ```
   bash <(curl -sSL https://raw.githubusercontent.com/alfi-rajasyah/solvro/main/setup.sh)
   ```
4. Access at `http://localhost:8080`.
