import type { LucideIcon } from 'lucide-react'
import { ChefHat, Package, ScanBarcode, ShoppingCart } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  prominent?: boolean
}

export const navItems: NavItem[] = [
  { to: '/inventory', label: 'Inventar', icon: Package },
  { to: '/scan', label: 'Scan', icon: ScanBarcode, prominent: true },
  { to: '/shopping', label: 'Cumpărături', icon: ShoppingCart },
  { to: '/ai', label: 'AI', icon: ChefHat },
]
