import './AdminSectionNav.css'

type AdminSectionNavItem = {
  href: string
  icon: string
  label: string
}

type AdminSectionNavProps = {
  label: string
  items: AdminSectionNavItem[]
}

function AdminSectionNav({
  label,
  items,
}: AdminSectionNavProps) {
  return (
    <nav className="admin-section-nav" aria-label={label}>
      {items.map((item) => (
        <a key={item.href} href={item.href}>
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  )
}

export default AdminSectionNav
