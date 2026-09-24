import type { ItemType } from '../types'

export interface ItemTemplate {
  type: ItemType
  label: string
  width: number
  height: number
  seats?: number
  icon: string
  category: 'furniture' | 'infrastructure' | 'special'
}

export const ITEM_LIBRARY: ItemTemplate[] = [
  { type: 'table_round', label: 'Banketttisch rund (Ø 1,5m)', width: 1.5, height: 1.5, seats: 8, icon: '⬤', category: 'furniture' },
  { type: 'table_rect', label: 'Banketttisch eckig (1,8x0,8m)', width: 1.8, height: 0.8, seats: 8, icon: '▭', category: 'furniture' },
  { type: 'table_high', label: 'Stehtisch (Ø 0,8m)', width: 0.8, height: 0.8, seats: 0, icon: '◍', category: 'furniture' },
  { type: 'table_low_round', label: 'Niedriger Rundtisch (Ø 0,6m)', width: 0.6, height: 0.6, seats: 0, icon: '○', category: 'furniture' },
  { type: 'chair', label: 'Stuhl', width: 0.5, height: 0.5, seats: 1, icon: '▢', category: 'furniture' },
  { type: 'armchair', label: 'Sessel (1x1m)', width: 1, height: 1, seats: 1, icon: '◫', category: 'furniture' },
  { type: 'sofa_2', label: 'Sofa 2-Sitzer (1,6x0,9m)', width: 1.6, height: 0.9, seats: 2, icon: '▭', category: 'furniture' },
  { type: 'sofa_3', label: 'Sofa 3-Sitzer (2x0,9m)', width: 2, height: 0.9, seats: 3, icon: '▬', category: 'furniture' },
  { type: 'sofa_corner', label: 'Ecksofa/Lounge-Insel (2,2x0,9m)', width: 2.2, height: 0.9, seats: 4, icon: '◲', category: 'furniture' },

  { type: 'bar', label: 'Mobile Bar/Theke (2x0,8m)', width: 2, height: 0.8, icon: '▬', category: 'infrastructure' },
  { type: 'truss', label: 'Traverse (3m)', width: 3, height: 0.3, icon: '═', category: 'infrastructure' },
  { type: 'curtain', label: 'Vorhang/Molton', width: 3, height: 0.1, icon: '╱', category: 'infrastructure' },
  { type: 'pipe_drape', label: 'Pipe & Drape (3x0,2m)', width: 3, height: 0.2, icon: '╫', category: 'infrastructure' },
  { type: 'podium', label: 'Bühnenpodest (2x1m)', width: 2, height: 1, icon: '▦', category: 'infrastructure' },
  { type: 'exhibition_stand', label: 'Messestand (2x2m)', width: 2, height: 2, icon: '▧', category: 'infrastructure' },
  { type: 'coat_rack', label: 'Garderobenständer', width: 0.6, height: 0.6, icon: '↟', category: 'infrastructure' },
  { type: 'plant', label: 'Pflanze', width: 0.5, height: 0.5, icon: '✿', category: 'infrastructure' },
  { type: 'screen', label: 'Leinwand (3x0,2m)', width: 3, height: 0.2, icon: '▮', category: 'infrastructure' },
]
