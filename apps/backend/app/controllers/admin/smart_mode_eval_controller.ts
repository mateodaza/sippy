/**
 * Admin SMART MODE Eval Controller
 *
 * Run the SMART MODE golden eval against a specific model config and return
 * a structured `EvalReport`. Real Groq calls happen — every request burns
 * tokens, so this lives behind admin-auth + adminRole.
 *
 * Routes:
 *   POST /admin/smart-mode/eval
 *
 * Body:
 *   {
 *     challenger?: 'primary' | 'fallback' | 'scout' | 'qwen'  // default: primary
 *     caseIds?: string[]                                       // subset; default: all
 *     preferredLangOverride?: 'en' | 'es' | 'pt'               // overrides per-case lang
 *   }
 *
 * Response: `EvalReport` from runner.ts — per-case results + summary
 * including by-category and by-failure-mode breakdowns.
 *
 * Why a controller and not just a CLI? Same code surface from a browser
 * (admin dashboard A/B button later) and from automation. CLI hits this
 * directly OR imports the runner — both work.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { classifyWithConfig, MODEL_PRESETS } from '#services/smart_mode/classifier'
import type { ModelPresetName } from '#services/smart_mode/classifier'
import { runEval, UnknownCaseIdsError } from '#services/smart_mode/eval/runner'
import { GOLDEN_DATASET } from '#services/smart_mode/eval/golden'

const PRESET_NAMES = Object.keys(MODEL_PRESETS) as ModelPresetName[]

const evalRequestValidator = vine.compile(
  vine.object({
    challenger: vine.enum(PRESET_NAMES).optional(),
    caseIds: vine.array(vine.string().trim().minLength(1)).optional(),
    preferredLangOverride: vine.enum(['en', 'es', 'pt'] as const).optional(),
  })
)

export default class SmartModeEvalController {
  /**
   * POST /admin/smart-mode/eval
   *
   * Runs the eval against the requested model preset. Returns the full
   * `EvalReport` as JSON so callers (browser, CLI, CI) can render summaries
   * or diff against a baseline.
   *
   * No request-side caching — every call is a fresh run. Caching would
   * mask intermittent failures and defeat the regression-detection point.
   */
  async run({ request, response }: HttpContext) {
    const { challenger, caseIds, preferredLangOverride } =
      await request.validateUsing(evalRequestValidator)

    const presetName: ModelPresetName = challenger ?? 'primary'
    const config = MODEL_PRESETS[presetName]

    logger.info(
      {
        preset: presetName,
        model: config.model,
        caseCount: caseIds?.length ?? GOLDEN_DATASET.length,
      },
      'smart_mode.eval: starting run'
    )

    const t0 = Date.now()
    let report
    try {
      report = await runEval(
        // Closure over the chosen config — runner stays model-agnostic.
        (args) => classifyWithConfig(args, config),
        GOLDEN_DATASET,
        { caseIds, preferredLangOverride }
      )
    } catch (err) {
      // Unknown case IDs → 422 with the offending IDs so the caller can
      // fix the typo. Silently filtering would let `--update-baseline`
      // snapshot a zero-case run.
      if (err instanceof UnknownCaseIdsError) {
        return response.unprocessableEntity({
          error: 'unknown_case_ids',
          unknownIds: err.unknownIds,
        })
      }
      throw err
    }
    const totalMs = Date.now() - t0

    logger.info(
      {
        preset: presetName,
        model: config.model,
        total: report.summary.total,
        passed: report.summary.passed,
        passRate: report.summary.passRate,
        avgLlmMs: report.summary.avgLlmMs,
        totalMs,
      },
      'smart_mode.eval: complete'
    )

    return response.ok({
      preset: presetName,
      model: config.model,
      runMs: totalMs,
      report,
    })
  }
}
