import type { ModelMap } from './common'
import { TABLE_MODELS } from './tables'
import { LOUNGE_MODELS } from './lounge'
import { BAR_STAGE_MODELS } from './barStage'
import { TEXTILE_MODELS } from './textiles'
import { RIGGING_DECO_MODELS } from './riggingDeco'
import { MISC_MODELS } from './misc'
import { CHAIR_MODELS } from './chairs'
import { LETTER_MODELS } from './letters'

/** 3D-Modelle je Objekttyp (visiova_frame, nivtec_group und text_label behandelt Venue3D selbst). */
export const MODELS: ModelMap = {
  ...TABLE_MODELS,
  ...LOUNGE_MODELS,
  ...BAR_STAGE_MODELS,
  ...TEXTILE_MODELS,
  ...RIGGING_DECO_MODELS,
  ...MISC_MODELS,
  ...CHAIR_MODELS,
  ...LETTER_MODELS,
}
