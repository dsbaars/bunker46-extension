export type PermissionEntry = {
  decision: 'allow' | 'deny';
  created_at: number;
};

export type DomainPolicies = {
  [host: string]: {
    [method: string]: PermissionEntry;
  };
};

export type ProfileSummary = {
  id: string;
  name?: string;
  picture?: string;
  signerPubkey?: string;
  connected: boolean;
};
