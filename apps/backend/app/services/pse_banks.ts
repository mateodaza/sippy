/**
 * Hardcoded fallback list of PSE banks.
 *
 * Colurs's `GET /api/reload/r2p/pse/banks/` returns 500 in prod (Django generic
 * error page). Until they fix it, we fall back to this static list of stable
 * Colombian ACH PSE codes assigned by ACH Colombia. Codes don't change often —
 * the list rarely needs updates.
 *
 * The PSE create endpoint (`/api/reload/r2p/pse/`) accepts the `code` directly
 * as `financial_institution_code`, so this list is sufficient for the dropdown.
 *
 * Once Colurs's `/banks/` endpoint is healthy again, the live call wins and
 * this fallback becomes dead code (kept for resilience).
 */
export interface PseBank {
  code: string
  name: string
}

export const PSE_BANKS_FALLBACK: PseBank[] = [
  { code: '1007', name: 'Bancolombia' },
  { code: '1001', name: 'Banco de Bogotá' },
  { code: '1019', name: 'BBVA Colombia' },
  { code: '1051', name: 'Davivienda' },
  { code: '1062', name: 'Banco de Occidente' },
  { code: '1006', name: 'Banco Agrario' },
  { code: '1052', name: 'AV Villas' },
  { code: '1023', name: 'Banco Caja Social' },
  { code: '1013', name: 'BCSC' },
  { code: '1009', name: 'Citibank' },
  { code: '1014', name: 'Itaú' },
  { code: '1060', name: 'Banco Pichincha' },
  { code: '1066', name: 'Banco Cooperativo Coopcentral' },
  { code: '1551', name: 'Daviplata' },
  { code: '1507', name: 'Nequi' },
  { code: '1801', name: 'MOVii' },
]
