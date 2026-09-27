import type { AccountInfo } from '../../types'

interface AccountRowProps {
  accounts: AccountInfo[]
  selected: string
  onPick: (account: string) => void
}

export const PROJECT_DEFAULT = ''

export function AccountRow({ accounts, selected, onPick }: AccountRowProps) {
  const options = [{ id: PROJECT_DEFAULT, name: 'Project default' }, ...accounts]
  return (
    <div className="account-row" role="radiogroup" aria-label="Account">
      {options.map((account) => (
        <button
          key={account.id || 'project-default'}
          role="radio"
          aria-checked={account.id === selected}
          className="account-pill"
          onClick={() => onPick(account.id)}
        >
          {account.name}
        </button>
      ))}
    </div>
  )
}

export function accountName(accounts: AccountInfo[] | undefined, id?: string): string {
  if (!accounts || accounts.length < 2 || !id) return ''
  return accounts.find((a) => a.id === id)?.name ?? ''
}
