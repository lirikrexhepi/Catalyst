import React from 'react';
import { DynamicIsland, DynamicIslandProps } from './DynamicIsland';

export type TopProjectPillProps = DynamicIslandProps;

/**
 * TopProjectPill (Dynamic Island)
 * Replaces the legacy pill with the authentic Apple Dynamic Island.
 */
export const TopProjectPill: React.FC<TopProjectPillProps> = (props) => {
  return <DynamicIsland {...props} />;
};

export { DynamicIsland };
export default TopProjectPill;
