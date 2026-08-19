const mongoose = require('mongoose');

const burialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Full name of deceased is required'],
    trim: true
  },
  dateOfDeath: {
    type: Date,
    required: [true, 'Date of death is required']
  },
  // Burial date is optional
  dateOfBurial: {
    type: Date,
    default: null
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  // Lot number is optional (not mandatory)
  lotNumber: {
    type: String,
    default: '',
    trim: true
  },
  // Lot owner name (optional)
  lotOwnerName: {
    type: String,
    default: '',
    trim: true
  },
  // Contact Email (optional)
  email: {
    type: String,
    default: '',
    trim: true
  },
  // Contact Phone Number (optional)
  phone: {
    type: String,
    default: '',
    trim: true
  },
  section: {
    type: String,
    default: 'Ground',
    trim: true
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

burialSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index fields for fast search queries
burialSchema.index({ name: 'text', address: 'text', lotNumber: 'text', lotOwnerName: 'text', email: 'text', phone: 'text' });

module.exports = mongoose.model('Burial', burialSchema);

