-- Table to store the main quotation data
CREATE TABLE IF NOT EXISTS quotations (
    id SERIAL PRIMARY KEY,
    rfp_title TEXT NOT NULL,
    client_name TEXT DEFAULT 'Valued Client',
    status TEXT DEFAULT 'draft', -- draft, saved, created, printed, sent, re_changes
    total_price NUMERIC(10, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    
    -- We store the complex structure (requirements, matches, line items) as JSONB
    -- This allows flexibility when the AI structure changes
    content JSONB, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system'
);

-- Table to track history and changes (Audit Trail)
CREATE TABLE IF NOT EXISTS quotation_audit_log (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g., 'created', 'updated_qty', 'status_change'
    changed_by TEXT DEFAULT 'user',
    previous_status TEXT,
    new_status TEXT,
    change_details TEXT, -- Description of what happened
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster searching by status or client
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);


-- Create the products table if it doesn't exist
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    title TEXT GENERATED ALWAYS AS (fixture_type || ' ' || wattage || ' ' || cct) STORED,
    indoor_outdoor TEXT,
    installation_type TEXT,
    fixture_type TEXT,
    wattage TEXT,
    cct TEXT, -- Color Temperature
    ip_rating TEXT,
    beam_angle TEXT,
    driver_type TEXT,
    housing_color TEXT,
    cri TEXT,
    connector TEXT,
    description TEXT, -- Full search text
    price NUMERIC(10, 2) DEFAULT 150.00, -- Placeholder pricing
    embedding vector(768) -- Google Gemini embedding dimension
);

-- Index for faster vector similarity search
CREATE INDEX IF NOT EXISTS products_embedding_idx ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Insert Data (Parsed from your input)
INSERT INTO products (indoor_outdoor, installation_type, fixture_type, wattage, cct, ip_rating, beam_angle, driver_type, housing_color, cri, connector, description) VALUES
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '2700K', 'IP67', '9x9D', 'DALI', 'Housing Color Dark Grey', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 2700K IP67 9x9D DALI Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '2700K', 'IP67', '9x9D', 'DALI', 'Housing Color Dark Grey', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 2700K IP67 9x9D DALI Dark Grey with Connector'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '2700K', 'IP67', '9x9D', 'DALI', 'Housing Color Black', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 2700K IP67 9x9D DALI Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '2700K', 'IP67', '9x9D', 'DALI', 'Housing Color Black', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 2700K IP67 9x9D DALI Black with Connector'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '2700K', 'IP67', '9x9D', 'DMX', 'Housing Color Brown', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 2700K IP67 9x9D DMX Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'Remote Driver', 'Housing Color Dark Grey', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D Remote Driver Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'Remote Driver', 'Housing Color Dark Grey', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D Remote Driver Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'Remote Driver', 'Housing Color Black', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D Remote Driver Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'Remote Driver', 'Housing Color Black', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D Remote Driver Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'ON/OFF', 'Housing Color Brown', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D ON/OFF Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'ON/OFF', 'Housing Color Brown', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D ON/OFF Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'ON/OFF', 'Housing Color Dark Grey', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D ON/OFF Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'ON/OFF', 'Housing Color Dark Grey', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D ON/OFF Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '4000K', 'IP66', 'Wallgrazing Medium', 'Remote Driver', 'Housing Color Brown', 'Ra>90', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 4000K IP66 Wallgrazing Medium Remote Driver Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '3000K', 'IP67', '80D', 'ON/OFF', 'Housing Color Black', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 75W 3000K IP67 80D ON/OFF Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '4000K', 'IP66', 'Wallgrazing Medium', 'Remote Driver', 'Housing Color Brown', 'Ra>90', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 4000K IP66 Wallgrazing Medium Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '75W', '4000K', 'IP67', 'Wallgrazing Medium', 'DMX', 'Housing Color Black', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 75W 4000K IP67 Wallgrazing Medium DMX Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', '4000K', 'IP67', 'Asymmetric 10X60', 'DMX', 'Housing Color Dark Grey', 'Ra>80', 'Standard', 'Outdoor Surfaced Wall Grazer 72W 4000K IP67 Asymmetric 10X60 DMX Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', '3000K', 'IP67', '9x9D', 'DALI', 'Housing Color Dark Grey', 'Ra>80', 'Connector with plug + joint acessory', 'Outdoor Surfaced Wall Grazer 72W 3000K IP67 9x9D DALI Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', 'RGBW', 'IP67', 'Asymmetric 15x60º', 'DMX', 'Housing Color Black', 'Ra>90', 'Standard', 'Outdoor Surfaced Wall Grazer 72W RGBW IP67 Asymmetric 15x60º DMX Black'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', 'RGBW', 'IP66', '60D', 'Remote Driver', 'Housing Color Brown', 'Ra>90', 'Standard', 'Outdoor Surfaced Wall Grazer 72W RGBW IP66 60D Remote Driver Brown'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', '4000K', 'IP66', '12D', 'ON/OFF', 'Housing Color Dark Grey', 'Ra>90', 'Standard', 'Outdoor Surfaced Wall Grazer 72W 4000K IP66 12D ON/OFF Dark Grey'),
('Outdoor', 'Surfaced', 'Wall Grazer', '72W', '3000K', 'IP67', '30D', 'DALI', 'Housing Color Black', 'Ra>90', 'Connector', 'Outdoor Surfaced Wall Grazer 72W 3000K IP67 30D DALI Black');



CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    user_email TEXT, -- Denormalized for easier querying if user deleted
    action TEXT NOT NULL, -- e.g., "Created Quotation", "Added Product", "Updated Opportunity"
    entity_type TEXT NOT NULL, -- "Quotation", "Product", "Opportunity"
    entity_id INTEGER,
    details JSONB, -- Flexible field for extra info (e.g., "Changed price from $100 to $120")
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by user or entity
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

-- Index for fast lookup by user or entity
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);


ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT;

-- Set default password for existing users (e.g., "password123")
-- Hash: $2b$12$eX... (This is just a placeholder, in real app generate new)
-- For dev simplicity, we might just leave them null and require reset or new registration.


-- Add image_url column if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Optional: Set a default placeholder for existing rows
UPDATE products 
SET image_url = '/placeholder-fixture.png' 
WHERE image_url IS NULL;


-- Add a column to store multiple image URLs as an array of text
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Ensure image_url is still there (it serves as the primary/thumbnail)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS db_chat_history (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sql_query TEXT,
    data_snapshot JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON db_chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON db_chat_history(timestamp);


-- Table for Quotation Discussions / Comments
CREATE TABLE IF NOT EXISTS quotation_comments (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER REFERENCES quotations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT, -- Snapshot in case user is deleted
    user_email TEXT,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE, -- To distinguish team-only notes vs client-visible
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster searching by status or client
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_comments_q_id ON quotation_comments(quotation_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotation_comments' AND column_name = 'attachments') THEN
        ALTER TABLE quotation_comments ADD COLUMN attachments JSONB DEFAULT '[]';
    END IF;
END $$;