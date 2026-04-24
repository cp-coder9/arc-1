import { db, auth } from "../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  deleteDoc,
  Timestamp
} from "firebase/firestore";
import { AgentKnowledge, KnowledgeStatus } from "../types";

const KNOWLEDGE_COLLECTION = "agent_knowledge";

export const getAgentKnowledge = async (agentId: string, status: KnowledgeStatus = "active"): Promise<AgentKnowledge[]> => {
  try {
    const q = query(
      collection(db, KNOWLEDGE_COLLECTION),
      where("agentRole", "==", agentId),
      where("status", "==", status)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentKnowledge));
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.warn(`[KnowledgeService] Permission denied for ${agentId} (${status}).`, {
        uid: auth.currentUser?.uid,
        isAuth: !!auth.currentUser
      });
      return [];
    }
    console.error("Error fetching agent knowledge:", error);
    return [];
  }
};

export const getAllAgentKnowledge = async (status: KnowledgeStatus = "active"): Promise<AgentKnowledge[]> => {
  try {
    const q = query(
      collection(db, KNOWLEDGE_COLLECTION),
      where("status", "==", status)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentKnowledge));
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.warn(`[KnowledgeService] Permission denied for all knowledge (${status}).`, {
        uid: auth.currentUser?.uid,
        isAuth: !!auth.currentUser
      });
      return [];
    }
    console.error("Error fetching all agent knowledge:", error);
    return [];
  }
};

export const getKnowledgeForAgents = async (agentRoles: string[], status: KnowledgeStatus = "active"): Promise<AgentKnowledge[]> => {
  try {
    const q = query(
      collection(db, KNOWLEDGE_COLLECTION),
      where("agentRole", "in", agentRoles),
      where("status", "==", status)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentKnowledge));
  } catch (error: any) {
    console.error("Error fetching knowledge for agents:", error);
    return [];
  }
};

export const addKnowledge = async (entry: Omit<AgentKnowledge, "id">): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, KNOWLEDGE_COLLECTION), {
      ...entry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding knowledge:", error);
    throw error;
  }
};

export const approveKnowledge = async (entryId: string, adminId: string) => {
  try {
    await updateDoc(doc(db, KNOWLEDGE_COLLECTION, entryId), {
      status: "active",
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error approving knowledge:", error);
    throw error;
  }
};

export const rejectKnowledge = async (entryId: string, adminId: string, reason: string) => {
  try {
    await updateDoc(doc(db, KNOWLEDGE_COLLECTION, entryId), {
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason, // Note: Added this field conceptually
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error rejecting knowledge:", error);
    throw error;
  }
};

export const updateKnowledge = async (entryId: string, content: string) => {
  try {
    await updateDoc(doc(db, KNOWLEDGE_COLLECTION, entryId), {
      content,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error updating knowledge:", error);
    throw error;
  }
};

export const deleteKnowledge = async (entryId: string) => {
  try {
    await deleteDoc(doc(db, KNOWLEDGE_COLLECTION, entryId));
  } catch (error) {
    console.error("Error deleting knowledge:", error);
    throw error;
  }
};

export const incrementKnowledgeUsage = async (entryId: string) => {
  try {
    const entryRef = doc(db, KNOWLEDGE_COLLECTION, entryId);
    await updateDoc(entryRef, {
      usageCount: Timestamp.now(),
      lastUsedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error incrementing knowledge usage:", error);
  }
};

export const searchKnowledge = async (searchTerm: string, agentRole?: string): Promise<AgentKnowledge[]> => {
  try {
    const allKnowledge = await getAllAgentKnowledge('active');
    const lowerSearch = searchTerm.toLowerCase();

    const filtered = allKnowledge.filter(entry => {
      const matchesSearch = entry.title.toLowerCase().includes(lowerSearch) ||
        entry.content.toLowerCase().includes(lowerSearch) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(lowerSearch));

      const matchesAgent = !agentRole || entry.agentRole === agentRole;

      return matchesSearch && matchesAgent;
    });

    return filtered;
  } catch (error) {
    console.error("Error searching knowledge:", error);
    return [];
  }
};

export const webSearchForAgent = async (query: string, agentRole: string, agentId: string): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User must be authenticated for web search");

    const idToken = await user.getIdToken();
    const response = await fetch("/api/agent/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify({ query, agentRole })
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    const searchContent = data.text || JSON.stringify(data);

    // Save as draft knowledge
    await addKnowledge({
      agentId,
      agentRole,
      title: `Web Search: ${query}`,
      content: searchContent,
      source: "web_search",
      status: "pending_review",
      submittedBy: user.uid,
      submittedByRole: "system", // Triggered by agent
      searchQuery: query,
      tags: ["web_search", agentRole],
      createdAt: new Date().toISOString()
    });

    return searchContent;
  } catch (error: any) {
    console.error("Web search failed:", error);
    if (error.code === 'permission-denied') {
      console.warn("[KnowledgeService] Web search failed at persistence layer.", {
        uid: auth.currentUser?.uid,
        isAuth: !!auth.currentUser
      });
    }
    return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
};
