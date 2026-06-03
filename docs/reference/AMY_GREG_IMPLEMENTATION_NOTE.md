# Amy / Greg Implementation Note

## Objective

Implement a new Architex navigation and messaging framework that keeps the platform simple while allowing exhaustive functionality.

## Immediate implementation tasks

1. Replace any long flat left navigation with top-level categories only.
2. Implement role-aware workspace menus under each category.
3. Add a Messages centre as a full workspace.
4. Add contextual messaging actions to workflow objects.
5. Add a shared navigation config file rather than hard-coding menu items in components.
6. Add a shared contextual messaging service/component model.
7. Ensure mobile messaging persistence links into the web platform.
8. Ensure messages can be linked to project/task/source objects.
9. Ensure agent-generated action cards can reference contextual conversations.
10. Hide admin-only items unless the user has permission.

## Suggested frontend components

- `MainSidebar`
- `WorkspaceSubnav`
- `CommandCentre`
- `ActionInbox`
- `MessagesCentre`
- `ContextualMessageButton`
- `ContextualMessageDrawer`
- `LinkedConversationPanel`
- `AgentActionCard`
- `ProjectPhaseNav`
- `RoleAwareToolboxMenu`

## Suggested services

- `navigationService`
- `workspaceMenuService`
- `contextualMessagingService`
- `conversationLinkService`
- `agentActionInboxService`
- `projectContextService`
- `cpdAgentWorkflowService`

## Suggested database collections / tables

- `navigation_definitions`
- `workspace_menu_definitions`
- `user_navigation_preferences`
- `conversations`
- `conversation_participants`
- `conversation_context_links`
- `messages`
- `message_attachments`
- `agent_action_cards`
- `project_activity_events`
- `workflow_object_links`
- `mobile_bridge_threads`

## Contextual messaging MVP objects

Implement contextual messaging first for:

1. Snag item
2. RFI
3. Site instruction
4. Payment certificate
5. Quote comparison
6. CPD failed assessment
7. CPD manual submission
8. Document review item
9. Inbox action card

## Guardrails

- Do not make every tool a sidebar item.
- Do not bury messaging only inside Messages centre.
- Do not let contextual messages lose project/task/source linkage.
- Do not expose cross-project context.
- Do not allow agents to send official instructions without approval.
- Do not mix CPD into Toolboxes.
- Do not show admin menus to normal users.
- Do not make mobile messaging a separate silo from the web platform.

## Suggested development sequence

### Sprint 1

- Create navigation config.
- Build simplified sidebar.
- Build workspace subnav shell.
- Build Command Centre placeholder.
- Build Inbox placeholder.

### Sprint 2

- Build Messages centre shell.
- Build `ContextualMessageButton`.
- Build contextual messaging service.
- Add message action to snags/RFIs/payment certificates/CPD assessments.

### Sprint 3

- Add conversation context links.
- Add linked conversation panel.
- Add agent action card integration.
- Add mobile bridge thread mapping.

### Sprint 4

- Add role-aware filtering.
- Add phase-aware project navigation.
- Add CPD role/body-aware menu sections.
- Add admin/settings gating.
