import { learningSyncRecordSchema } from '@/learning/contracts';
import type { LearningSyncCategoryId, LearningSyncRecord } from '@/learning/domain';
import { unwrap } from './helpers';
import { LEARNING_REPLICA_KINDS } from '../learningReplicaKinds';
import type { ReplicaAdapter } from '../replicaRegistry';
import type { ReplicaRow } from '@/types/replica';

export const createLearningReplicaAdapter = (
  category: LearningSyncCategoryId,
): ReplicaAdapter<LearningSyncRecord> => ({
  kind: LEARNING_REPLICA_KINDS[category],
  schemaVersion: 1,
  encryptedFields: ['payload'],
  encryptionPolicy: 'required',
  pack(record) {
    if (record.category !== category) {
      throw new Error(`Replica kind for ${category} cannot pack ${record.category}`);
    }
    return { payload: JSON.stringify(record) };
  },
  unpack(fields) {
    const payload = fields['payload'];
    if (typeof payload !== 'string') throw new Error(`Missing encrypted ${category} payload`);
    return learningSyncRecordSchema.parse(JSON.parse(payload));
  },
  computeId: async (record) => record.id,
  unpackRow(row: ReplicaRow) {
    const payload = unwrap(row.fields_jsonb['payload']);
    if (typeof payload !== 'string') return null;
    return learningSyncRecordSchema.parse(JSON.parse(payload));
  },
});

export const learningReplicaAdapters = Object.keys(LEARNING_REPLICA_KINDS).map((category) =>
  createLearningReplicaAdapter(category as LearningSyncCategoryId),
);
