import { FormEvent, useState } from 'react'
import { Database, KeyRound, Palette, Server, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TIMEZONE } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

export function SettingsPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const rows = [
    [Database, 'Supabase', 'Conectado pelo ambiente'],
    [Server, 'Cobalt', 'Aquisição externa de mídia'],
    [KeyRound, 'OpenRouter', 'IA e transcrição no backend'],
    [ShieldCheck, 'Segurança', 'RLS e Storage privado'],
    [Palette, 'Fuso operacional', TIMEZONE],
  ] as const

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      toast.error('Use pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmation) {
      toast.error('As senhas não coincidem.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setPassword('')
    setConfirmation('')
    toast.success('Senha atualizada com segurança.')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Ambiente</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Configurações</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Integrações sensíveis são configuradas no backend e nunca exibidas aqui.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Estado dos serviços</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {rows.map(([Icon, name, description]) => (
            <div key={name} className="flex items-center gap-4 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-secondary"><Icon size={18} /></div>
              <div className="flex-1">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Badge variant="success">Configurado</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alterar minha senha</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={updatePassword}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="new-password">Nova senha</label>
              <Input id="new-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="confirm-password">Confirmar nova senha</label>
              <Input id="confirm-password" type="password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
            </div>
            <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Atualizar senha'}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Política editorial padrão</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Gerar texto jornalístico, claro e direto. Preservar os fatos, sinalizar divergências entre fontes, nunca inventar nomes, números, locais, datas ou citações. Toda alteração por IA exige prévia e confirmação humana.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
