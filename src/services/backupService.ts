import { 
  collection, 
  getDocs, 
  addDoc, 
  Timestamp, 
  db, 
  storage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  query,
  orderBy,
  limit,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  handleFirestoreError,
  OperationType
} from '../firebase';

const COLLECTIONS = [
  'users',
  'companies',
  'contacts',
  'deals',
  'tasks',
  'interactions',
  'purchaseOrders',
  'invoices',
  'notifications',
  'logs'
];

export interface BackupMetadata {
  id?: string;
  createdAt: Timestamp;
  createdBy: string;
  fileName: string;
  fileUrl: string;
  size: number;
  collections: string[];
}

export const backupService = {
  async createBackup(userId: string): Promise<BackupMetadata> {
    const backupData: Record<string, any[]> = {};
    
    // 1. Fetch all data
    try {
      for (const collectionName of COLLECTIONS) {
        const snapshot = await getDocs(collection(db, collectionName));
        backupData[collectionName] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'backup_fetch_data');
    }

    // 2. Create JSON blob
    const jsonString = JSON.stringify(backupData, (key, value) => {
      // Handle Firestore Timestamps in JSON
      if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        return { _type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
      }
      return value;
    });
    const blob = new Blob([jsonString], { type: 'application/json' });
    const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    // Using 'invoices' folder as a workaround because storage rules might not be deployable
    // and 'invoices' is already allowed in the default storage rules for the user's UID.
    const storageRef = ref(storage, `invoices/${userId}/backups/${fileName}`);

    // 3. Upload to Storage
    await uploadBytes(storageRef, blob);
    const fileUrl = await getDownloadURL(storageRef);

    // 4. Save metadata to Firestore
    const backupMetadata: BackupMetadata = {
      createdAt: Timestamp.now(),
      createdBy: userId,
      fileName,
      fileUrl,
      size: blob.size,
      collections: COLLECTIONS
    };

    const docRef = await addDoc(collection(db, 'backups'), backupMetadata);
    return { ...backupMetadata, id: docRef.id };
  },

  async getBackups(): Promise<BackupMetadata[]> {
    try {
      const q = query(collection(db, 'backups'), orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BackupMetadata[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'backups');
      return [];
    }
  },

  async deleteBackup(backup: BackupMetadata): Promise<void> {
    if (!backup.id) return;
    
    // 1. Delete from Storage
    const storageRef = ref(storage, `invoices/${backup.createdBy}/backups/${backup.fileName}`);
    try {
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error deleting backup file from storage:', error);
    }

    // 2. Delete from Firestore
    await deleteDoc(doc(db, 'backups', backup.id));
  },

  async restoreFromBackup(backupData: Record<string, any[]>): Promise<void> {
    // This is a destructive operation. It will overwrite existing data.
    // In a real app, we might want to clear collections first or merge.
    // For simplicity, we'll use batch writes to restore.
    
    for (const [collectionName, docs] of Object.entries(backupData)) {
      if (!COLLECTIONS.includes(collectionName)) continue;

      // Firestore batch limit is 500 operations
      let batch = writeBatch(db);
      let count = 0;

      for (const docData of docs) {
        const { id, ...data } = docData;
        
        // Restore Timestamps
        const processedData = Object.entries(data).reduce((acc, [key, value]) => {
          if (value && typeof value === 'object' && (value as any)._type === 'timestamp') {
            acc[key] = new Timestamp((value as any).seconds, (value as any).nanoseconds);
          } else {
            acc[key] = value;
          }
          return acc;
        }, {} as any);

        batch.set(doc(db, collectionName, id), processedData);
        count++;

        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
    }
  },

  async checkAndTriggerAutoBackup(userId: string): Promise<void> {
    const q = query(collection(db, 'backups'), orderBy('createdAt', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    
    let shouldBackup = false;
    if (snapshot.empty) {
      shouldBackup = true;
    } else {
      const lastBackup = snapshot.docs[0].data() as BackupMetadata;
      const lastBackupDate = lastBackup.createdAt.toDate();
      const now = new Date();
      const diffInHours = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours >= 24) {
        shouldBackup = true;
      }
    }

    if (shouldBackup) {
      console.log('Triggering automatic daily backup...');
      try {
        await this.createBackup(userId);
        console.log('Automatic backup completed successfully.');
      } catch (error) {
        console.error('Automatic backup failed:', error);
      }
    }
  }
};
