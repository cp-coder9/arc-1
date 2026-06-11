# Architex Site Structure and Messaging-First Navigation Brief

Prepared for: Greg and Amy
Prepared by: Hymie for Leor
Purpose: restructure the Architex platform navigation so the full web platform remains comprehensive, while the user experience stays simple, mobile-first, messaging-priority, workflow-led and agent-assisted.

## 1. Core instruction from Leor

Architex is not just a normal web application with a long sidebar of tools. It is a cellphone-first, messaging-priority platform that persists into and synchronises with the full web platform.

The website must therefore be structured around:

1. A simple top-level navigation framework.
2. Role-aware and phase-aware workspaces.
3. A persistent messaging layer linked to the mobile messaging app.
4. Contextual message access inside workflows, not only in a separate messaging centre.
5. Agent-driven action inboxes and guided workflows.
6. Full tool access where needed, without overwhelming the default interface.

The current left-hand navigation should not become a flat list of every feature. It should become a clean skeleton into which modules can be slotted.

## 2. Design principle

The sidebar is the skeleton.
The workspaces are the organs.
The agents are the workflow muscles.
The messaging layer is the nervous system.

Users should not need to understand the full platform just to complete one task. If a user is issuing a snag report, preparing a CPD submission, approving a quote, responding to an RFI or reviewing a payment certificate, messaging should be available in that context.

Example:
A user inside the snag tool should be able to click “Message Project Group” and ask a question linked to that snag item, without leaving the snag workflow.

## 3. Recommended top-level sidebar

Recommended clean sidebar:

1. Command Centre
2. Inbox
3. Projects
4. Toolboxes
5. CPD & Learning
6. Documents
7. Marketplace
8. Finance
9. Messages
10. Settings

If space is tight, Messages can be visually docked/persistent rather than treated as a standard sidebar item, but it still needs a full functional centre.

## 4. Messaging must exist in two modes

### Mode A: Messaging Centre

A full messaging workspace for persistent communication.

Includes:
- Direct messages
- Project groups
- Project phase channels
- CPD support or course channels
- Agent conversations
- System announcements
- Message-linked tasks
- WhatsApp/mobile bridge status where relevant
- Search across conversations
- Attachments and records

### Mode B: Contextual Messaging Access

A lightweight message action available next to work items and workflow screens.

Examples:
- Snag item: “Message project group about this snag”
- RFI: “Ask project group”
- Drawing review issue: “Message responsible professional”
- CPD failed assessment: “Ask CPD support / course facilitator”
- Manual CPD submission: “Message CPD coordinator”
- Payment certificate: “Message QS / contractor / client”
- Quote comparison: “Ask supplier / project group”
- Council submission: “Message project group about submission status”

This contextual button should carry the context object into the message thread.

## 5. What context must be attached to a message

Every contextual message should be able to include:

- Project ID and project name
- Current phase
- Source module
- Source object type
- Source object ID
- Human-readable title
- Relevant status
- Linked files if any
- Suggested recipients
- Agent summary of the context
- Permission scope
- Whether message should be persisted as a project record

Example attached context:

```
Project: House Deutsch
Phase: Construction
Module: Snag Tools
Object: Snag #SN-041
Status: Open
Message target: Project group
Agent context summary: User is asking about water ingress snag at east window. Photos attached. Contractor response pending.
```

## 6. Messaging persistence requirement

The same conversation context must persist between:

- Mobile messaging app / WhatsApp-first interface
- Web messaging centre
- Project workspace
- Workflow-specific contextual messages
- Agent action inbox
- Project records and audit trail where applicable

A message sent from a workflow should not be “lost” as a generic chat. It should remain linked to the project/task/workflow object.

## 7. Agent involvement

Agents should support both messaging modes.

### Personal user agent

- Curates the user’s Command Centre and Inbox.
- Suggests who to message in a workflow.
- Drafts short contextual messages if requested.
- Reminds user of unanswered project/CPD/finance messages.

### Project agent

- Maintains project context.
- Links messages to project objects.
- Summarises project group conversations.
- Converts message outcomes into tasks/RFIs/instructions/snags where authorised.

### CPD agent

- Handles failed assessment retakes.
- Pushes manual submission reminders.
- Links CPD messages to course, assessment, certificate or professional-body submission records.

### System/governance agent

- Enforces permissions.
- Prevents leakage across projects/companies/users.
- Ensures agent-generated messages are distinguishable from human messages.

## 8. Implementation goal for Greg and Amy

Build the framework first, then slot modules into it.

Required implementation structure:

1. Define the sidebar categories.
2. Define each workspace’s internal section structure.
3. Define the contextual messaging action model.
4. Define which modules expose message buttons.
5. Persist message context links to project/task/CPD/finance objects.
6. Feed message-linked tasks into the Inbox.
7. Let agents create suggested next actions, but keep user control.

## 9. Critical UX rule

Do not force the user to go to “Messages” to communicate during a workflow.

The Messages centre is for full communication management.
Contextual messaging is for quick action at the point of work.

Both must exist.

## 10. Suggested MVP

Phase 1:
- Replace long sidebar with 8–10 main categories.
- Add Command Centre and Inbox concepts.
- Add Messages centre.
- Add contextual messaging button component.
- Implement contextual messaging in Projects, Snags, RFIs, CPD assessments and Payment Certificates.

Phase 2:
- Add agent-drafted contextual messages.
- Add message-to-task conversion.
- Add message-linked audit trail.
- Add mobile messaging bridge context syncing.

Phase 3:
- Add role-aware and phase-aware message routing.
- Add project agent conversation summaries.
- Add CPD agent reminders and submission prompts.
- Add cross-platform persistent conversation threads.
