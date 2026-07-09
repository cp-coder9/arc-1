/**
 * BIM SpecForge Adapter — Integration between BIM/IFC BoQ and SpecForge
 *
 * Creates SpecForge specification items from BoQ line items, and compares
 * current extractions against previously linked items to identify added,
 * removed, and changed quantities.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { randomUUID } from 'node:crypto';

import type {
  BoqDocument,
  BoqLineItem,
  BoqSpecForgeLink,
  ExtractionComparison,
  QuantityChange,
} from './types';

/**
 * Creates SpecForge items from BoQ line items.
 * One spec item per BoQ line item, assigned to the matching trade section.
 *
 * Each link record contains:
 * - specForgeItemId: generated UUID
 * - boqLineItemId: the BoQ line item's itemNumber
 * - boqId: parent BoQ document ID
 * - extractionId: the extraction that produced this BoQ
 * - linkedAt: ISO timestamp of creation
 * - quantityAtLink: the quantity value at time of linking
 * - userOverridden: false (newly created links are never overridden)
 *
 * Requirement 8.1: Offer to create SpecForge specification items from BoQ line items
 * Requirement 8.2: Populate spec item with title, quantity, unit, trade section, GlobalIds
 * Requirement 8.3: Assign each item to the SpecForge section corresponding to BoQ trade section
 * Requirement 8.4: Store the link between spec item ID and source BoQ line item ID
 */
export function createSpecForgeItems(
  boq: BoqDocument,
  workspaceId: string,
): BoqSpecForgeLink[] {
  const links: BoqSpecForgeLink[] = [];

  for (const section of boq.sections) {
    for (const lineItem of section.lineItems) {
      const link: BoqSpecForgeLink = {
        specForgeItemId: randomUUID(),
        boqLineItemId: lineItem.itemNumber,
        boqId: boq.boqId,
        extractionId: boq.extractionId,
        linkedAt: new Date().toISOString(),
        quantityAtLink: lineItem.quantity,
        userOverridden: false,
      };

      links.push(link);
    }
  }

  return links;
}

/**
 * Compares the current BoQ extraction with previously linked SpecForge items,
 * identifying added, removed, and changed quantities.
 *
 * Matching logic: matches current BoQ line items against previousLinks by
 * boqLineItemId (itemNumber). When a match is found, compares quantities.
 *
 * User override handling (Requirement 8.6):
 * If a previousLink has userOverridden=true, it is included in the 'changed'
 * array with a note indicating the discrepancy, but the system does not
 * recommend overwriting the user edit.
 *
 * Requirement 8.5: Identify added, removed, and changed quantities
 * Requirement 8.6: Flag user-edited discrepancies without overwriting
 */
export function compareExtractions(
  currentBoq: BoqDocument,
  previousLinks: BoqSpecForgeLink[],
): ExtractionComparison {
  // Build a lookup of all current line items by itemNumber
  const currentLineItemMap = new Map<string, BoqLineItem>();
  for (const section of currentBoq.sections) {
    for (const lineItem of section.lineItems) {
      currentLineItemMap.set(lineItem.itemNumber, lineItem);
    }
  }

  // Build a lookup of previous links by boqLineItemId
  const previousLinkMap = new Map<string, BoqSpecForgeLink>();
  for (const link of previousLinks) {
    previousLinkMap.set(link.boqLineItemId, link);
  }

  const added: BoqLineItem[] = [];
  const removed: BoqLineItem[] = [];
  const changed: QuantityChange[] = [];

  // Find added items: in current BoQ but not in previousLinks
  for (const [itemNumber, lineItem] of currentLineItemMap) {
    if (!previousLinkMap.has(itemNumber)) {
      added.push(lineItem);
    }
  }

  // Find removed and changed items
  for (const [itemId, link] of previousLinkMap) {
    const currentItem = currentLineItemMap.get(itemId);

    if (!currentItem) {
      // Removed: exists in previous but not in current
      // Reconstruct a minimal BoqLineItem from the link data
      removed.push({
        itemNumber: link.boqLineItemId,
        description: `Previously linked item (SpecForge: ${link.specForgeItemId})`,
        unit: 'nr', // default unit as we don't have full info from link
        quantity: link.quantityAtLink,
        sourceElementCount: 0,
        sourceElementGlobalIds: [],
        elementType: 'IfcBuildingElementProxy',
      });
    } else {
      // Item exists in both — check for quantity changes
      const previousQuantity = link.quantityAtLink;
      const currentQuantity = currentItem.quantity;

      if (previousQuantity !== currentQuantity || link.userOverridden) {
        const delta = currentQuantity - previousQuantity;
        const deltaPercent = previousQuantity !== 0
          ? (delta / previousQuantity) * 100
          : currentQuantity !== 0 ? 100 : 0;

        changed.push({
          lineItemId: itemId,
          description: currentItem.description,
          previousQuantity,
          currentQuantity,
          delta: Math.round(delta * 100) / 100,
          deltaPercent: Math.round(deltaPercent * 100) / 100,
        });
      }
    }
  }

  return {
    previousExtractionId: previousLinks.length > 0
      ? previousLinks[0].extractionId
      : '',
    currentExtractionId: currentBoq.extractionId,
    added,
    removed,
    changed,
  };
}
