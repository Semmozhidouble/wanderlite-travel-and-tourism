#!/usr/bin/env node

/**
 * Dataset Conversion Script
 * Converts CSV destination data to JSON format
 * Usage: node scripts/convert-dataset.js [input.csv] [output.json]
 */

const fs = require('fs');
const path = require('path');

// Default paths
const DEFAULT_INPUT = path.join(__dirname, '../data/raw/destinations.csv');
const DEFAULT_OUTPUT = path.join(__dirname, '../frontend/src/data/destinations.json');

// Get command line arguments
const inputFile = process.argv[2] || DEFAULT_INPUT;
const outputFile = process.argv[3] || DEFAULT_OUTPUT;

console.log('🔄 Converting destination dataset...');
console.log(`   Input: ${inputFile}`);
console.log(`   Output: ${outputFile}`);

// Simple CSV parser
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    
    data.push(obj);
  }

  return data;
}

// Transform CSV row to destination format
function transformDestination(row, index) {
  return {
    id: row.id || String(index + 1),
    name: row.name || row.destination || 'Unknown',
    city: row.city || row.name?.split(',')[0] || '',
    state: row.state || row.region || row.name?.split(',')[1]?.trim() || '',
    category: row.category || row.type || 'Adventure',
    description: row.description || row.details || 'Explore this amazing destination',
    shortDescription: row.short_description || row.tagline || row.description?.substring(0, 50) || 'Discover more',
    image: row.image || row.image_url || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80',
    best_time: row.best_time || row.season || 'Year-round',
    weather: row.weather || row.climate || 'Pleasant',
    lat: parseFloat(row.lat || row.latitude || 0),
    lng: parseFloat(row.lng || row.lon || row.longitude || 0),
    rating: parseFloat(row.rating || 4.5),
    attractions: row.attractions ? row.attractions.split(';').map(a => a.trim()) : [],
    activities: row.activities ? row.activities.split(';').map(a => a.trim()) : []
  };
}

// Main conversion function
function convertDataset() {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
      console.warn(`⚠️  Input file not found: ${inputFile}`);
      console.log('   Creating sample output from mock data...');
      
      // Use mock data from frontend as fallback
      const mockDataPath = path.join(__dirname, '../frontend/src/data/mock.js');
      if (fs.existsSync(mockDataPath)) {
        const mockContent = fs.readFileSync(mockDataPath, 'utf8');
        const destinationsMatch = mockContent.match(/export const destinations = (\[[\s\S]*?\]);/);
        
        if (destinationsMatch) {
          const destinations = eval(destinationsMatch[1]);
          const output = {
            destinations: destinations.map((d, i) => ({
              id: String(d.id || i + 1),
              name: d.name,
              city: d.name.split(',')[0],
              state: d.name.split(',')[1]?.trim() || '',
              category: d.category,
              description: d.description,
              shortDescription: d.shortDescription,
              image: d.image,
              best_time: d.bestTime,
              weather: d.weather,
              lat: d.lat || 0,
              lng: d.lng || 0,
              rating: 4.5,
              attractions: d.attractions || [],
              activities: d.activities || []
            }))
          };
          
          // Ensure output directory exists
          const outputDir = path.dirname(outputFile);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
          console.log(`✅ Sample output created: ${output.destinations.length} destinations`);
          return;
        }
      }
      
      console.error('❌ Could not create sample output');
      process.exit(1);
    }

    // Read and parse CSV
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const rows = parseCSV(csvContent);
    
    console.log(`   Parsed ${rows.length} rows from CSV`);

    // Transform data
    const destinations = rows.map((row, index) => transformDestination(row, index));
    
    // Create output object
    const output = {
      destinations: destinations
    };

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write JSON file
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    console.log(`✅ Conversion complete!`);
    console.log(`   Converted ${destinations.length} destinations`);
    console.log(`   Output saved to: ${outputFile}`);

    // Show sample
    if (destinations.length > 0) {
      console.log('\n📍 Sample destination:');
      console.log(JSON.stringify(destinations[0], null, 2));
    }

  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    process.exit(1);
  }
}

// Run conversion
convertDataset();
