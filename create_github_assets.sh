#!/bin/bash

# GitHub repository information
OWNER="Borelli-7"
REPO="bg-mcp-server"
BRANCH="feature/architecture-documentation"
TOKEN="${GH_TOKEN}"

# Issue details
ISSUE_TITLE="feat: Add comprehensive architecture documentation with PlantUML diagrams"
ISSUE_BODY='## Description

Add comprehensive architecture documentation for the Berlin Group MCP Server project with detailed PlantUML diagrams explaining the system design.

## Changes

### Architecture Diagrams (9 PlantUML diagrams)
1. **Component Architecture** - System components and their relationships
2. **Class Diagram** - Detailed class structure and interfaces
3. **Deployment Diagram** - Runtime configuration and file locations
4. **Initialization Sequence** - Server startup and data loading process
5. **Search Endpoints Sequence** - Step-by-step endpoint search flow
6. **Get Endpoint Details Sequence** - Detailed endpoint retrieval process
7. **Search Schemas Sequence** - Schema search and retrieval flows
8. **PDF Search Sequence** - PDF document search functionality
9. **Comprehensive Search Sequence** - Unified search across all sources

### Documentation
- Comprehensive README.md explaining:
  - Project overview and purpose
  - Architecture overview and data flows
  - All supported tools and their functionality
  - Data structures and interfaces
  - Initialization sequence details
  - Detailed functionality flows for each feature
  - Design patterns used
  - Performance considerations
  - Security considerations
  - Future enhancement opportunities

## Benefits
- Improved project understanding for new developers
- Clear visual representation of system architecture
- Detailed sequence diagrams for each major functionality
- Comprehensive documentation of data flows
- Reference material for API design discussions
- Foundation for future architecture decisions

## Files Added
- `docs/architecture/diagrams/01-component-architecture.puml`
- `docs/architecture/diagrams/02-class-diagram.puml`
- `docs/architecture/diagrams/03-deployment-diagram.puml`
- `docs/architecture/diagrams/04-initialization-sequence.puml`
- `docs/architecture/diagrams/05-search-endpoints-sequence.puml`
- `docs/architecture/diagrams/06-get-endpoint-details-sequence.puml`
- `docs/architecture/diagrams/07-search-schemas-sequence.puml`
- `docs/architecture/diagrams/08-pdf-search-sequence.puml`
- `docs/architecture/diagrams/09-search-all-sequence.puml`
- `docs/architecture/diagrams/README.md`

## Type
- [x] Documentation
- [ ] Feature
- [ ] Bug Fix
- [ ] Breaking Change

## Checklist
- [x] Added architecture diagrams
- [x] Added comprehensive documentation
- [x] Diagrams explain all major components
- [x] Sequence diagrams cover key functionalities
- [x] Documentation is clear and maintainable'

ASSIGNEE="Borelli-7"

# PR details
PR_TITLE="docs: Add comprehensive architecture documentation with PlantUML diagrams"
PR_BODY="## Description

Adds comprehensive architecture documentation for the Berlin Group MCP Server with 9 detailed PlantUML diagrams and comprehensive README.

## Changes
- 9 PlantUML diagrams explaining system architecture and functionality
- Comprehensive README with project overview, design patterns, and future enhancements
- All files organized in \`docs/architecture/diagrams/\` directory

## Diagrams Included
1. Component architecture
2. Class diagram
3. Deployment diagram
4. Initialization sequence
5. Search endpoints sequence
6. Get endpoint details sequence
7. Search schemas sequence
8. PDF search sequence
9. Comprehensive search (search_all) sequence

See docs/architecture/diagrams/README.md for detailed documentation.

## Type
- [x] Documentation
- [ ] Feature
- [ ] Bug Fix

## Checklist
- [x] All diagrams created and documented
- [x] README includes architecture overview
- [x] Data flows clearly explained
- [x] All components documented
- [x] Ready for review"

echo "GitHub Issue and PR Creation Script"
echo "===================================="
echo ""
echo "Issue Title: $ISSUE_TITLE"
echo "PR Title: $PR_TITLE"
echo ""
echo "Note: To create these automatically, you need:"
echo "1. GitHub CLI (gh) installed"
echo "2. GitHub authentication configured"
echo ""
echo "Manual Creation URLs:"
echo "====================="
echo ""
echo "Create Issue: https://github.com/$OWNER/$REPO/issues/new"
echo "Create PR: https://github.com/$OWNER/$REPO/pull/new/$BRANCH"
echo ""
echo "Issue Details:"
echo "Title: $ISSUE_TITLE"
echo "Body: [See above]"
echo "Assignee: $ASSIGNEE"
echo "Labels: documentation, architecture"
echo ""
echo "PR Details:"
echo "Title: $PR_TITLE"
echo "Body: [See above]"
echo "Labels: documentation, architecture"
