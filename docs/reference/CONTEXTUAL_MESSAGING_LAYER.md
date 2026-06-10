# Contextual Messaging Layer

## 1. Purpose

Architex is cellphone-first and messaging-priority. Messaging should not be isolated in one menu item only. The system must support full communication management through a Messages centre and quick contextual communication inside workflows.

## 2. Two-layer messaging model

### Full Messages Centre

The Messages centre is the complete conversation workspace.

Use it for:
- Managing direct conversations
- Managing project group conversations
- Searching messages
- Reviewing attachments
- Seeing agent conversations
- Seeing persistent mobile-message history
- Managing unread messages and message-linked tasks

### Contextual Messaging Action

Contextual messaging is a lightweight action exposed inside the current workflow.

Use it for:
- Asking a question from within a snag item
- Messaging a project group from an RFI
- Asking a CPD coordinator about a manual submission
- Asking a contractor about a variation
- Asking a QS about a payment certificate
- Asking a supplier about a quote

## 3. Where contextual messaging should appear

Add contextual message access to:

- Project dashboard
- Snag item
- RFI
- Site instruction
- Variation
- Payment certificate
- Drawdown request
- Quote comparison
- BoQ / BoM item
- Drawing compliance issue
- Council/statutory submission item
- CPD assessment
- CPD certificate
- CPD manual submission
- CPD course / webinar
- Marketplace quote request
- Document review item
- Agent inbox action card

## 4. Context object requirements

Every contextual message action should include a `MessagingContext` object.

Minimum fields:
- contextId
- projectId, if applicable
- projectName, if applicable
- phaseId / phaseName, if applicable
- moduleKey
- sourceObjectType
- sourceObjectId
- title
- status
- suggestedRecipients
- suggestedChannel
- summary
- linkedFileIds
- persistencePolicy
- auditPolicy

## 5. Recipient routing examples

Snag:
- Suggested channel: project group or contractor thread
- Suggested recipients: contractor, principal agent, architect, project manager

RFI:
- Suggested channel: project group or responsible consultant thread
- Suggested recipients: originator, responsible consultant, project agent

CPD failed assessment:
- Suggested channel: CPD support / course facilitator
- Suggested recipients: learner, CPD agent, course facilitator

Manual CPD submission:
- Suggested channel: CPD coordinator
- Suggested recipients: learner, CPD accreditation coordinator, CPD agent

Payment certificate:
- Suggested channel: commercial/project finance thread
- Suggested recipients: contractor, QS, client, principal agent

Quote comparison:
- Suggested channel: procurement/project group
- Suggested recipients: supplier, QS, project manager, client where relevant

## 6. Persistence policies

Recommended persistence policies:

- `conversation_only`: message stays in conversation history only.
- `project_record`: message is linked into project record.
- `source_object_record`: message is linked to the source object, e.g. a snag or RFI.
- `audit_required`: message or outcome is locked into audit trail.
- `agent_action_required`: agent should create/follow up an action card.

## 7. Agent behaviours

Agents should be able to:

- Draft a contextual message from the source object.
- Suggest recipients.
- Attach a short context summary.
- Convert message outcomes into action cards.
- Remind users of unanswered messages.
- Summarise long project threads.
- Link decisions back to source objects.

Agents must not:

- Send messages as the user without explicit approval.
- Expose private context to unauthorised recipients.
- Convert informal chat into formal instruction without confirmation.
- Confuse mobile WhatsApp-style chat with official project/audit record unless policy says it is recordable.

## 8. UX recommendation

Each workflow object should expose a compact communication block:

- Message project group
- Message responsible person
- Ask agent to draft message
- View linked conversation
- Create follow-up action

The user should be able to communicate without leaving the workflow screen.
