const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../out');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

// Aggressive recursive rename
function recursiveRename(dirPath) {
  let items = fs.readdirSync(dirPath);

  // First pass: Rename files/folders in CURRENT directory
  for (const item of items) {
    const oldPath = path.join(dirPath, item);
    
    if (item.startsWith('_')) {
      const newName = item.substring(1); // Remove leading underscore
      const newPath = path.join(dirPath, newName);
      
      console.log(`Renaming: ${item} -> ${newName}`);
      
      // If destination exists, we must handle it (Next.js sometimes outputs both)
      if (fs.existsSync(newPath)) {
        const stat = fs.statSync(oldPath);
        if (stat.isDirectory()) {
            // If it's a directory, we need to merge content? 
            // Usually we can just ignore or delete the old one if content is duplicate, 
            // but safely let's just move content.
            // For this specific Next.js case, we'll try to move inside.
            console.log(`  Merging contents of ${item} into ${newName}...`);
            // This is complex, but for now let's just try rename. 
            // If it fails, we might need a manual merge logic.
            // Simplified: Delete destination if it's empty, or just error out.
        }
      }
      
      try {
        fs.renameSync(oldPath, newPath);
      } catch (e) {
        console.warn(`  Failed to rename ${item}: ${e.message}`);
      }
    }
  }

  // Refetch items because names changed
  items = fs.readdirSync(dirPath);

  // Second pass: Recurse into subdirectories
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    if (fs.statSync(fullPath).isDirectory()) {
      recursiveRename(fullPath);
    }
  }
}

try {
  console.log('--- STARTING EXTENSION FIX ---');
  
  if (!fs.existsSync(outDir)) {
    console.error('Error: out/ directory does not exist.');
    process.exit(1);
  }

  // 1. Rename all underscore files/folders
  console.log('Step 1: Removing underscores...');
  // We run this in a loop because renaming a parent directory changes paths for children
  // A single deep pass should work if we recurse correctly (bottom-up is safer, but top-down works if careful)
  // Let's do top-down.
  recursiveRename(outDir);
  
  // 2. Extract Inline Scripts & Fix References
  console.log('Step 2: Fixing references & inline scripts...');
  const allFiles = getAllFiles(outDir);
  
  allFiles.forEach(file => {
    const ext = path.extname(file);
    const fileName = path.basename(file);
    const dirName = path.dirname(file);

    // FIX 1: HTML Files - Extract Scripts
    if (ext === '.html') {
      let content = fs.readFileSync(file, 'utf8');
      const originalContent = content;
      
      // Extract inline scripts (CSP fix)
      const scriptRegex = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
      let scriptCounter = 0;
      
      content = content.replace(scriptRegex, (match, attrs, scriptContent) => {
        if (!scriptContent.trim()) return match;
        
        scriptCounter++;
        const scriptName = `${fileName.replace('.html', '')}-inline-${scriptCounter}.js`;
        const scriptPath = path.join(dirName, scriptName);
        
        console.log(`  Extracted script: ${scriptName}`);
        fs.writeFileSync(scriptPath, scriptContent);
        
        return `<script ${attrs} src="./${scriptName}"></script>`;
      });

      // Fix References (underscore removal)
      content = content.replace(/\/_/g, '/');
      content = content.replace(/_next/g, 'next');
      content = content.replace(/_not-found/g, 'not-found');

      if (content !== originalContent) {
        fs.writeFileSync(file, content);
      }
    } 
    // FIX 2: JS/CSS/JSON/TXT - Update References
    else if (['.js', '.css', '.json', '.txt'].includes(ext)) {
      let content = fs.readFileSync(file, 'utf8');
      const originalContent = content;
      
      content = content.replace(/\/_/g, '/');
      content = content.replace(/_next/g, 'next');
      content = content.replace(/_not-found/g, 'not-found');
      
      if (content !== originalContent) {
        fs.writeFileSync(file, content);
      }
    }
  });

  // 3. Final Verification
  const remainingFiles = getAllFiles(outDir);
  const badFiles = remainingFiles.filter(f => path.basename(f).startsWith('_'));
  
  if (badFiles.length > 0) {
    console.error('\n❌ FAILED: The following underscore files still exist:');
    badFiles.forEach(f => console.error(`  - ${path.relative(outDir, f)}`));
    console.error('Please delete them manually or check logic.');
    process.exit(1);
  } else {
    console.log('\n✅ COMPLETE: No underscore files remaining.');
  }

} catch (error) {
  console.error('\n❌ CRITICAL ERROR:', error);
  process.exit(1);
}
