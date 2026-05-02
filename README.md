
# "Solvro: The Solution-to-Project Lifecycle Engine"

**Solvro** is internal Customer Success platform designed to bridge the strategic gap between **Solution Architects (SA)** and **Technical Account Managers (TAM)**. By integrating solution blueprints directly into project execution, Solvro ensures a seamless handover, eliminating manual data entry and information loss.


## 📖 Project Overview

In the Customer Success lifecycle, the transition from "Solution Design" to "Project Implementation" is critical. **Solvro** automates this. 

When a Solution Architect finalizes a technical design, Solvro ingests the data, and connected to the TAM’s dashboard. This replaces the need for general-purpose paid project management tools with a tailor-made, high-performance internal solution.

## 🎯 Purpose & Goals
* **Unified Workflow:** Seamless integration between SA blueprints and TAM operations.
* **Data Integrity:** Centralized repository for all technical project requirements.
* **Cost Optimization:** Decommissioning paid project management tools subscriptions by June 2026.

---

## 🛠 Technical Stack

### **Core Backend**
* **Language:** **Go (Golang) 1.22+** (Chosen for high concurrency and performance).
* **Framework:** **Gin** or **Echo** (High-performance, lightweight web frameworks).

### **Data & Infrastructure**
* **Database:** **PostgreSQL 15+** (Robust relational data management).
* **Containerization:** **Docker & Docker Compose** (Architecture: `linux/amd64`).
* **Deployment:** Linux Production Environment.

---

## 🏗 System Architecture

1.  **SA Ingestion Port:** A secure REST API/Webhook that receives solution payloads from the SA Application.
2.  **TAM Dashboard:** A high-speed web interface (React/HTMX) for daily task management, Kanban tracking, and reporting.

---

## 🚀 Getting Started (Development)

### **Prerequisites**
* Mac with Docker Desktop installed.
* Go 1.22+ installed locally (for IDE support).

### **Installation**
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/solvro.git
   cd solvro
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

3. Run the application using Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

4. Access at `http://localhost:8080`.
