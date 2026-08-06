export const TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || 'America/Maceio'
export const ROLES = ['admin','editor','writer','viewer'] as const
export const STATUSES = ['processing','draft','awaiting_approval','changes_requested','approved','scheduled','published','cancelled','archived','failed'] as const
export type Role = typeof ROLES[number]
export type NewsStatus = typeof STATUSES[number]
export const statusLabels: Record<NewsStatus,string> = {processing:'Processando',draft:'Rascunho',awaiting_approval:'Aguardando aprovação',changes_requested:'Ajustes solicitados',approved:'Aprovado',scheduled:'Agendado',published:'Publicado',cancelled:'Cancelado',archived:'Arquivado',failed:'Falha'}
export const roleLabels: Record<Role,string> = {admin:'Administrador',editor:'Editor',writer:'Redator',viewer:'Visualizador'}
export const statusTransitions: Record<NewsStatus,NewsStatus[]> = {processing:['draft','failed'],draft:['awaiting_approval','cancelled','archived'],awaiting_approval:['approved','changes_requested','cancelled'],changes_requested:['awaiting_approval','cancelled'],approved:['scheduled','published','changes_requested'],scheduled:['published','cancelled'],published:['archived'],cancelled:['draft','archived'],archived:['draft'],failed:['processing','archived']}

const processingStepLabels: Record<string, string> = {
  validate_url: 'Validando o link',
  fetch_metadata: 'Lendo o conteúdo original',
  extract_metadata: 'Lendo o conteúdo original',
  fetch_media: 'Baixando e salvando a mídia',
  download_media: 'Baixando a mídia',
  upload_media: 'Salvando a mídia',
  extract_audio: 'Preparando o áudio',
  transcribe_audio: 'Transcrevendo o áudio',
  extract_ocr: 'Lendo o texto da imagem',
  generate_copy: 'Gerando título e legenda',
  completed: 'Notícia pronta',
  finalize: 'Finalizando a notícia',
}

export function processingStepLabel(step: string | null | undefined) {
  if (!step) return 'Processando a notícia'
  return processingStepLabels[step] || 'Processando a notícia'
}
