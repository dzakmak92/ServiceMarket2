#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## [2026-06-09] Explorer 3-month intro plan (NEW FEATURE)

backend:
  - task: "Explorer intro plan billing lifecycle"
    implemented: true
    working: "NA"
    file: "backend/routes/billing_routes.py, backend/services/billing_service.py"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          NEW pricing model. For a pro's first 3 months ONLY the Explorer plan is offered:
          €1/month, charged €3 upfront, unlocks ALL toolkits (invoice/tax/pm) + Pro badge.
          After 3 months -> upgrade gate (Claim Pro badge OR stay Standard).
          Endpoints: GET /api/billing/subscription-status & /api/billing/pricing now return
          `billing_mode` (explorer_offer | explorer_active | gate | pro) + explorer fields.
          POST /api/billing/checkout/explorer (€3 stripe session, only in explorer_offer mode).
          POST /api/billing/explorer/simulate-expiry (test: active->gate, unsets toolkit flags).
          POST /api/billing/explorer/simulate-reset (test: ->fresh explorer_offer).
          POST /api/billing/explorer/choose-standard (gate: stay standard, sets gate_dismissed).
          Explorer counts as premium: pro_badge true (job_routes), free quotes (no contact fee in quote_routes),
          instant push (push_routes). expire_stale_subscriptions now also expires explorers past explorer_ends_at.
          Test pro (pro@test.com) pre-seeded as explorer_active (89 days left, all toolkits).
          Verified via curl: full cycle offer->checkout(url)->active->expiry->gate->reset works.

frontend:
  - task: "Explorer billing UI (offer / active / gate cards)"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/pro/BillingPage.jsx, frontend/src/utils/tier.js"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          BillingPage branches on billing_mode: ExplorerOfferCard (testid explorer-offer-card,
          explorer-activate-btn), ExplorerActiveCard (explorer-active-card, explorer-open-* links),
          UpgradeGateCard (upgrade-gate-card, gate-claim-pro-btn, gate-stay-standard-btn),
          and ExplorerDevControls (explorer-dev-controls, explorer-dev-reset, explorer-dev-expire).
          Pro badge now shows for explorer tier across ProCard/ProDetailPage/SearchPage/Header via
          utils/tier.js isPremiumTier(). Dashboard Pro KPIs unlock for explorer too.
          Smoke screenshot confirms ExplorerActiveCard renders for pro@test.com.

  test_plan:
    current_focus:
      - "Explorer offer/active/gate lifecycle (frontend + backend)"
      - "Regression: toolkits (invoice/tax/pm), jobs vs projects, invoicing, quotes, billing"
    test_priority: "high_first"
