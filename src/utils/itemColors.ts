import type { ItemType } from '../types'

/** Standardfarbe je Objekttyp (2D und 3D). */
export function getDefaultColor(type: ItemType): string {
  const defaults: Record<ItemType, string> = {
    table_round: '#FCD34D',      // yellow
    table_rect: '#FCD34D',       // yellow
    table_high: '#FCD34D',       // yellow
    table_low_round: '#FCD34D',  // yellow
    chair: '#F87171',            // red
    chair_row_group: '#F87171',  // red
    bar: '#A78BFA',              // purple
    truss: '#D1D5DB',            // grey
    curtain: '#7c3aed',          // purple (keep existing)
    podium: '#A78BFA',           // purple
    nivtec_group: '#1d4ed8',     // blue
    area: '#60A5FA',             // blue
    exhibition_stand: '#F87171', // red
    sofa_3: '#F87171',           // red
    sofa_2: '#F87171',           // red
    sofa_corner: '#F87171',      // red
    armchair: '#F87171',         // red
    coat_rack: '#D1D5DB',        // grey
    plant: '#10b981',            // green
    screen: '#D1D5DB',           // grey
    pipe_drape: '#7c3aed',
    visiova_frame: '#9ca3af',       // purple
    text_label: '#1f2937',       // dark grey
    custom_rect: '#94a3b8',
    custom_round: '#94a3b8',
  }
  return defaults[type]
}
