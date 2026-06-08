const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Auth Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.adminUser) {
    return next();
  }
  res.redirect('/admin/login');
}

// Redirect if already logged in
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.adminUser) {
    return res.redirect('/admin');
  }
  next();
}

// GET Login Page
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('admin_login', { error: req.query.error });
});

// POST Login Action
router.post('/login', redirectIfAuth, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.redirect('/admin/login?error=Username and password are required');
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.redirect('/admin/login?error=Invalid username or password');
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      return res.redirect('/admin/login?error=Invalid username or password');
    }

    // Set Session
    req.session.adminUser = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    res.redirect('/admin');
  } catch (error) {
    next(error);
  }
});

// GET Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET Admin Dashboard (protected)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      orderBy: { id: 'desc' },
    });

    const bookings = await prisma.booking.findMany({
      include: { trip: true },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate quick stats
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
    const approvedBookings = bookings.filter(b => b.status === 'APPROVED').length;
    
    // Total Revenue is sum of price of approved bookings
    const totalRevenue = bookings
      .filter(b => b.status === 'APPROVED' && b.trip)
      .reduce((sum, b) => sum + b.trip.price, 0);

    res.render('admin', {
      admin: req.session.adminUser,
      trips,
      bookings,
      stats: {
        totalBookings,
        pendingBookings,
        approvedBookings,
        totalRevenue
      },
      message: req.query.message,
      error: req.query.error
    });
  } catch (error) {
    next(error);
  }
});

// CRUD - Create Trip
router.post('/trips', requireAuth, async (req, res, next) => {
  try {
    const { title, destination, price, slotsAvailable, imageUrl, description } = req.body;
    
    if (!title || !destination || !price || !slotsAvailable || !description) {
      return res.redirect('/admin?error=Missing required fields for new trip');
    }

    await prisma.trip.create({
      data: {
        title,
        destination,
        price: parseFloat(price),
        slotsAvailable: parseInt(slotsAvailable),
        imageUrl: imageUrl || '/images/raja_ampat.png', // default if empty
        description,
      },
    });

    res.redirect('/admin?message=Trip package created successfully!');
  } catch (error) {
    next(error);
  }
});

// CRUD - Update Trip
router.post('/trips/:id/update', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, destination, price, slotsAvailable, imageUrl, description } = req.body;

    if (!title || !destination || !price || !slotsAvailable || !description) {
      return res.redirect('/admin?error=Missing required fields for update');
    }

    await prisma.trip.update({
      where: { id: parseInt(id) },
      data: {
        title,
        destination,
        price: parseFloat(price),
        slotsAvailable: parseInt(slotsAvailable),
        imageUrl: imageUrl || '/images/raja_ampat.png',
        description,
      },
    });

    res.redirect('/admin?message=Trip package updated successfully!');
  } catch (error) {
    next(error);
  }
});

// CRUD - Delete Trip
router.post('/trips/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.trip.delete({
      where: { id: parseInt(id) },
    });

    res.redirect('/admin?message=Trip package deleted successfully!');
  } catch (error) {
    next(error);
  }
});

// Update Booking Status
router.post('/bookings/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // APPROVED or CANCELLED or PENDING

    if (!['PENDING', 'APPROVED', 'CANCELLED'].includes(status)) {
      return res.redirect('/admin?error=Invalid booking status');
    }

    const bookingId = parseInt(id);

    // Get current booking to check status change
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });

    if (!booking) {
      return res.redirect('/admin?error=Booking not found');
    }

    const prevStatus = booking.status;
    const nextStatus = status;

    if (prevStatus === nextStatus) {
      return res.redirect('/admin?message=Booking status unchanged.');
    }

    await prisma.$transaction(async (tx) => {
      // Update Booking
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: nextStatus },
      });

      // Handle Slot replenishment/reduction
      // Case 1: Active -> Cancelled (Replenish slot)
      if (prevStatus !== 'CANCELLED' && nextStatus === 'CANCELLED') {
        await tx.trip.update({
          where: { id: booking.tripId },
          data: { slotsAvailable: { increment: 1 } },
        });
      }
      // Case 2: Cancelled -> Active (Reduce slot)
      else if (prevStatus === 'CANCELLED' && nextStatus !== 'CANCELLED') {
        // Double check slots availability
        const currentTrip = await tx.trip.findUnique({
          where: { id: booking.tripId },
        });

        if (currentTrip.slotsAvailable <= 0) {
          throw new Error('Cannot reactivate booking. No slots available for this trip!');
        }

        await tx.trip.update({
          where: { id: booking.tripId },
          data: { slotsAvailable: { decrement: 1 } },
        });
      }
    });

    res.redirect(`/admin?message=Booking status updated to ${nextStatus}!`);
  } catch (error) {
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }
});

module.exports = router;
