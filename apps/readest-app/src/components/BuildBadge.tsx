import React from 'react';
import { BUILD_LABEL } from '@/libs/buildLabel';

/** A red note naming the build, so a device's version can be told at a glance. Nothing without a label. */
const BuildBadge: React.FC<{ label?: string; large?: boolean }> = ({
  label = BUILD_LABEL,
  large = false,
}) =>
  label ? (
    <p
      role='note'
      className={`build-badge text-center font-semibold text-red-600 ${large ? 'text-base' : 'text-xs'}`}
    >
      {large ? `This is a new build (${label})` : `Build ${label}`}
    </p>
  ) : null;

export default BuildBadge;
