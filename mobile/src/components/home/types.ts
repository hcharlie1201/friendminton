export type Tab = 'home' | 'discover' | 'record' | 'groups' | 'you';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';

export type DiscoveryPreferences = {
  city: string;
  latitude: number | null;
  longitude: number | null;
  skillLevel: SkillLevel | null;
};

export type DiscoveryLocation = Pick<DiscoveryPreferences, 'city' | 'latitude' | 'longitude'>;

export const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'discover', label: 'Discover' },
  { key: 'record', label: 'Record' },
  { key: 'groups', label: 'Groups' },
  { key: 'you', label: 'You' },
];
