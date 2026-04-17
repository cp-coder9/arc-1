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
  deleteDoc
} from "firebase/firestore";
import { AgentKnowledge, KnowledgeStatus } from "../types";

const KNOWLEDGE_COLLECTION = "agent_knowledge";

export const getAgentKnowledge = async (agentId: string, status: KnowledgeStatus = "active"): Promise<AgentKnowledge[]> => {
  try {
    const q = query(
      collection(db, KNOWLEDGE_COLLECTION),
      where("agentId", "==", agentId),
      where("status", "==", status)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentKnowledge));
  } catch (error) {
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
  } catch (error) {
    console.error("Error fetching all agent knowledge:", error);
    return [];
  }
};

export const addKnowledge = async (entry: Omit<AgentKnowledge, "id">): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, KNOWLEDGE_COLLECTION), {
      ...entry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
  } catch (error) {
    console.error("Web search failed:", error);
    return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
};
