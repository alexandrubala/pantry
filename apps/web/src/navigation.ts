import type { LucideIcon } from 'lucide-react'
import { ChefHat, House, Package, ScanBarcode, ShoppingCart } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  prominent?: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/scan', label: 'Scan', icon: ScanBarcode, prominent: true },
  { to: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/ai', label: 'AI', icon: ChefHat },
]
