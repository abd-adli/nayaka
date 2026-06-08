const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const passwordHash = bcrypt.hashSync('adminpassword', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: passwordHash,
      role: 'admin',
    },
  });
  console.log('Admin user created/verified:', admin.username);

  // Clear existing bookings and trips for a clean, consistent seed state
  await prisma.booking.deleteMany({});
  await prisma.trip.deleteMany({});

  const trips = [
    {
      title: 'Raja Ampat Luxury Retreat',
      destination: 'West Papua',
      price: 1250,
      slotsAvailable: 12,
      imageUrl: '/images/raja_ampat.png',
      description: 'Experience pure paradise aboard our luxury private yacht. Traverse clear turquoise waters, explore limestone islets, and dive into the world\'s most biodiverse coral reefs. Daily halal gourmet dining, massage therapy, and island excursions included.',
    },
    {
      title: 'Bromo Sunrise Jeep Adventure',
      destination: 'East Java',
      price: 350,
      slotsAvailable: 15,
      imageUrl: '/images/bromo.png',
      description: 'Chasing the iconic golden sunrise over the active caldera of Bromo. Traveling in style with a private 4x4 Jeep caravan, exploring the sea of sand, and relaxing in a 5-star mountain lodge with hot spring pools.',
    },
    {
      title: 'Ubud Jungle & Wellness Escape',
      destination: 'Bali',
      price: 650,
      slotsAvailable: 8,
      imageUrl: '/images/ubud_villa.png',
      description: 'Reconnect with nature in our award-winning private infinity-pool villas in Ubud. Enjoy curated family yoga, holistic sound healing sessions, biological farming tours, and private organic dining prepared by world-class chefs.',
    },
  ];

  for (const trip of trips) {
    const created = await prisma.trip.create({
      data: trip,
    });
    console.log(`Created trip: ${created.title}`);
  }

  console.log('Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
