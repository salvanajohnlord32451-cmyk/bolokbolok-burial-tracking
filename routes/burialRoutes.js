const express = require('express');
const router = express.Router();
const Burial = require('../models/Burial');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');

// Protect all burial routes with auth
router.use(auth);

// @route   GET /api/burials
// @desc    Get all burial records with search & filter parameters
router.get('/', async (req, res) => {
  try {
    const { search, deathFrom, deathTo, burialFrom, burialTo, lotFilter, removalStatus, sortBy, sortOrder } = req.query;

    const query = {};

    // 1. Search by Name, Address, Lot Number, Owner Name, Email, or Phone
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { address: searchRegex },
        { lotNumber: searchRegex },
        { lotOwnerName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { section: searchRegex },
        { notes: searchRegex }
      ];
    }

    // 2. Date Range Filter - Date of Death
    if (deathFrom || deathTo) {
      query.dateOfDeath = query.dateOfDeath || {};
      if (deathFrom) query.dateOfDeath.$gte = new Date(deathFrom);
      if (deathTo) {
        const toDate = new Date(deathTo);
        toDate.setHours(23, 59, 59, 999);
        query.dateOfDeath.$lte = toDate;
      }
    }

    // 3. Date Range Filter - Date of Burial (Optional)
    if (burialFrom || burialTo) {
      query.dateOfBurial = query.dateOfBurial || {};
      if (burialFrom) query.dateOfBurial.$gte = new Date(burialFrom);
      if (burialTo) {
        const toDate = new Date(burialTo);
        toDate.setHours(23, 59, 59, 999);
        query.dateOfBurial.$lte = toDate;
      }
    }

    // 4. Lot Filter
    if (lotFilter) {
      if (lotFilter === 'unassigned') {
        query.$or = [{ lotNumber: '' }, { lotNumber: { $exists: false } }, { lotNumber: null }];
      } else if (lotFilter === 'assigned') {
        query.lotNumber = { $exists: true, $ne: '', $ne: null };
      } else if (lotFilter !== 'all') {
        query.lotNumber = new RegExp(`^${lotFilter.trim()}$`, 'i');
      }
    }

    // 5. 20-Year Removal Status Filter
    if (removalStatus) {
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);

      query.dateOfDeath = query.dateOfDeath || {};
      if (removalStatus === 'eligible') {
        query.dateOfDeath.$lte = twentyYearsAgo;
      } else if (removalStatus === 'not_eligible') {
        query.dateOfDeath.$gt = twentyYearsAgo;
      }
    }

    // Sorting
    const sort = {};
    const field = sortBy || 'createdAt';
    const order = sortOrder === 'asc' ? 1 : -1;
    sort[field] = order;

    const burials = await Burial.find(query)
      .sort(sort)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      count: burials.length,
      burials
    });
  } catch (error) {
    console.error('Error fetching burials:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving burial records', error: error.message });
  }
});

// @route   GET /api/burials/stats
// @desc    Get inventory summary statistics & lot usage
router.get('/stats', async (req, res) => {
  try {
    const totalBurials = await Burial.countDocuments();
    const assignedLots = await Burial.countDocuments({ lotNumber: { $exists: true, $ne: '', $ne: null } });
    const unassignedLots = totalBurials - assignedLots;

    // Recent 30 days burials (or recorded)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentBurials = await Burial.countDocuments({
      $or: [
        { dateOfBurial: { $gte: thirtyDaysAgo } },
        { createdAt: { $gte: thirtyDaysAgo } }
      ]
    });

    // 20-Year Removal Status Eligible Count
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    const eligibleForRemoval = await Burial.countDocuments({ dateOfDeath: { $lte: twentyYearsAgo } });

    // Distinct sections
    const sections = await Burial.distinct('section');

    res.json({
      success: true,
      stats: {
        totalBurials,
        assignedLots,
        unassignedLots,
        recentBurials,
        eligibleForRemoval,
        totalSections: sections.length
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving statistics' });
  }
});

// @route   GET /api/burials/audit-logs
// @desc    Get all audit log activity history
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(100)
      .populate('performedBy', 'name email');

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving audit logs' });
  }
});

// @route   GET /api/burials/:id
// @desc    Get single burial record by ID
router.get('/:id', async (req, res) => {
  try {
    const burial = await Burial.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    if (!burial) {
      return res.status(404).json({ success: false, message: 'Burial record not found' });
    }
    res.json({ success: true, burial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error retrieving burial record' });
  }
});

// @route   POST /api/burials
// @desc    Create a new burial record & track audit log
router.post('/', async (req, res) => {
  try {
    const { name, dateOfDeath, dateOfBurial, address, lotNumber, lotOwnerName, email, phone, section, notes } = req.body;

    if (!name || !dateOfDeath || !address) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all mandatory fields: Full Name, Date of Death, and Address.'
      });
    }

    const burial = new Burial({
      name: name.trim(),
      dateOfDeath,
      dateOfBurial: dateOfBurial ? dateOfBurial : null, // Optional
      address: address.trim(),
      lotNumber: lotNumber ? lotNumber.trim() : '', // Optional
      lotOwnerName: lotOwnerName ? lotOwnerName.trim() : '', // Optional
      email: email ? email.trim() : '', // Optional
      phone: phone ? phone.trim() : '', // Optional
      section: section ? section.trim() : 'Ground',
      notes: notes ? notes.trim() : '',
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await burial.save();

    // Create Audit Log
    const auditLog = new AuditLog({
      action: 'CREATE',
      recordId: burial._id.toString(),
      recordName: burial.name,
      performedBy: req.user._id,
      details: `Created burial record for "${burial.name}" ${burial.lotNumber ? `(Lot: ${burial.lotNumber})` : '(No lot assigned)'}`
    });
    await auditLog.save();

    res.status(201).json({
      success: true,
      message: 'Burial record created successfully',
      burial
    });
  } catch (error) {
    console.error('Error creating burial:', error);
    res.status(500).json({ success: false, message: 'Server error creating record', error: error.message });
  }
});

// @route   PUT /api/burials/:id
// @desc    Update a burial record & track audit log
router.put('/:id', async (req, res) => {
  try {
    const { name, dateOfDeath, dateOfBurial, address, lotNumber, lotOwnerName, email, phone, section, notes } = req.body;

    let burial = await Burial.findById(req.params.id);
    if (!burial) {
      return res.status(404).json({ success: false, message: 'Burial record not found' });
    }

    const changes = [];
    if (name && name.trim() !== burial.name) {
      changes.push(`Name changed from "${burial.name}" to "${name.trim()}"`);
      burial.name = name.trim();
    }
    if (dateOfDeath) burial.dateOfDeath = dateOfDeath;
    if (dateOfBurial !== undefined) burial.dateOfBurial = dateOfBurial ? dateOfBurial : null;
    if (address && address.trim() !== burial.address) {
      changes.push(`Address updated`);
      burial.address = address.trim();
    }
    if (lotNumber !== undefined) {
      const newLot = lotNumber ? lotNumber.trim() : '';
      if (newLot !== burial.lotNumber) {
        changes.push(`Lot changed from "${burial.lotNumber || 'None'}" to "${newLot || 'None'}"`);
        burial.lotNumber = newLot;
      }
    }
    if (lotOwnerName !== undefined) burial.lotOwnerName = lotOwnerName ? lotOwnerName.trim() : '';
    if (email !== undefined) burial.email = email ? email.trim() : '';
    if (phone !== undefined) burial.phone = phone ? phone.trim() : '';
    if (section !== undefined) burial.section = section ? section.trim() : 'Ground';
    if (notes !== undefined) burial.notes = notes ? notes.trim() : '';

    burial.updatedBy = req.user._id;
    await burial.save();

    // Create Audit Log
    const auditLog = new AuditLog({
      action: 'UPDATE',
      recordId: burial._id.toString(),
      recordName: burial.name,
      performedBy: req.user._id,
      details: changes.length > 0 ? changes.join('; ') : `Updated record details for "${burial.name}"`
    });
    await auditLog.save();

    res.json({
      success: true,
      message: 'Burial record updated successfully',
      burial
    });
  } catch (error) {
    console.error('Error updating burial:', error);
    res.status(500).json({ success: false, message: 'Server error updating record', error: error.message });
  }
});

// @route   DELETE /api/burials/:id
// @desc    Delete a burial record & track audit log
router.delete('/:id', async (req, res) => {
  try {
    const burial = await Burial.findById(req.params.id);
    if (!burial) {
      return res.status(404).json({ success: false, message: 'Burial record not found' });
    }

    const recordName = burial.name;
    const recordId = burial._id.toString();

    await burial.deleteOne();

    // Create Audit Log for Deletion
    const auditLog = new AuditLog({
      action: 'DELETE',
      recordId: recordId,
      recordName: recordName,
      performedBy: req.user._id,
      details: `Deleted burial record of "${recordName}"`
    });
    await auditLog.save();

    res.json({
      success: true,
      message: `Burial record for "${recordName}" deleted successfully.`
    });
  } catch (error) {
    console.error('Error deleting burial:', error);
    res.status(500).json({ success: false, message: 'Server error deleting record' });
  }
});

module.exports = router;
