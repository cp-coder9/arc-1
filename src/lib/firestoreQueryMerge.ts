import { onSnapshot, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';

export function subscribeToMergedQuerySnapshots<T>(
  queries: Query<DocumentData>[],
  mapDoc: (docSnap: QueryDocumentSnapshot<DocumentData>) => T & { id?: string },
  onItems: (items: T[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const buckets = new Map<number, Map<string, T>>();

  const emit = () => {
    const merged = new Map<string, T>();
    for (const bucket of buckets.values()) {
      for (const [id, item] of bucket.entries()) merged.set(id, item);
    }
    onItems(Array.from(merged.values()));
  };

  const unsubs = queries.map((queryRef, queryIndex) => onSnapshot(queryRef, (snapshot) => {
    const bucket = new Map<string, T>();
    snapshot.docs.forEach((docSnap) => {
      bucket.set(docSnap.id, mapDoc(docSnap));
    });
    buckets.set(queryIndex, bucket);
    emit();
  }, (error) => {
    onError?.(error);
  }));

  if (queries.length === 0) onItems([]);

  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}
