import { db } from './db'
import { seedDatabase } from './seed-data'

const counts = seedDatabase(db)
console.log(
  `Seeded ${counts.users} users, ${counts.customers} customers, ${counts.feedback} feedback items, and ${counts.notes} notes.`
)
