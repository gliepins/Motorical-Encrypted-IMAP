--
-- PostgreSQL database dump
--

\restrict vjyksDJOMSXmMGAsuVKDXnrh8OwwJYv3dJffqnIC9fuGLB88PLPS7vsHXdGQPNr

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: generate_vaultbox_smtp_username(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_vaultbox_smtp_username(domain_name text, vaultbox_uuid uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    suffix_counter INTEGER := 0;
BEGIN
    -- Create base username: vaultbox-domain-shortid
    base_username := 'vaultbox-' || 
                     LOWER(REPLACE(domain_name, '.', '-')) || '-' ||
                     SUBSTRING(vaultbox_uuid::TEXT, 1, 8);
    
    final_username := base_username;
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM vaultbox_smtp_credentials WHERE username = final_username) LOOP
        suffix_counter := suffix_counter + 1;
        final_username := base_username || '-' || suffix_counter;
    END LOOP;
    
    RETURN final_username;
END;
$$;


ALTER FUNCTION public.generate_vaultbox_smtp_username(domain_name text, vaultbox_uuid uuid) OWNER TO postgres;

--
-- Name: update_vaultbox_smtp_credentials_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_vaultbox_smtp_credentials_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_vaultbox_smtp_credentials_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: imap_app_credentials; Type: TABLE; Schema: public; Owner: encimap
--

CREATE TABLE public.imap_app_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    vaultbox_id uuid,
    password_hash character varying(255),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.imap_app_credentials OWNER TO encimap;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vaultbox_id uuid NOT NULL,
    message_id character varying(255),
    from_domain character varying(255),
    to_alias character varying(255),
    size_bytes integer,
    received_at timestamp with time zone DEFAULT now(),
    storage jsonb NOT NULL,
    headers_meta jsonb,
    flags jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: vaultbox_certs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vaultbox_certs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vaultbox_id uuid NOT NULL,
    label character varying(100),
    public_cert_pem text NOT NULL,
    fingerprint_sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vaultbox_certs OWNER TO postgres;

--
-- Name: vaultbox_smtp_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vaultbox_smtp_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vaultbox_id uuid NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_used timestamp with time zone,
    enabled boolean DEFAULT true,
    host text DEFAULT 'mail.motorical.com'::text,
    port integer DEFAULT 587,
    security_type text DEFAULT 'STARTTLS'::text,
    messages_sent_count integer DEFAULT 0,
    last_message_sent timestamp with time zone,
    CONSTRAINT valid_port CHECK (((port > 0) AND (port <= 65535))),
    CONSTRAINT valid_security_type CHECK ((security_type = ANY (ARRAY['STARTTLS'::text, 'TLS'::text, 'PLAIN'::text])))
);


ALTER TABLE public.vaultbox_smtp_credentials OWNER TO postgres;

--
-- Name: vaultboxes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vaultboxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    domain text NOT NULL,
    name character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    limits jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    smtp_enabled boolean DEFAULT false,
    alias character varying(100),
    mailbox_type character varying(20) DEFAULT 'encrypted'::character varying,
    CONSTRAINT vaultboxes_mailbox_type_check CHECK (((mailbox_type)::text = ANY ((ARRAY['encrypted'::character varying, 'simple'::character varying])::text[])))
);


ALTER TABLE public.vaultboxes OWNER TO postgres;

--
-- Name: COLUMN vaultboxes.mailbox_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.vaultboxes.mailbox_type IS 'Type of mailbox: encrypted (S/MIME with certs) or simple (standard IMAP)';


--
-- Data for Name: imap_app_credentials; Type: TABLE DATA; Schema: public; Owner: encimap
--

COPY public.imap_app_credentials (id, user_id, username, created_at, revoked_at, vaultbox_id, password_hash, updated_at) FROM stdin;
8d861450-6222-4d97-a946-a9bf2471ba81	1d003971-2ea7-46b3-8995-4ceb38f9bc77	encimap-hatfree-com-uz12lg	2025-10-23 12:52:39.052194+00	\N	64f4545b-4740-4f76-b853-204160819c5f	$2b$12$yP9r1QZUo4x1Swi5a0b1feCupKPvmTHQhcse8EdsNlbILyKPbM/TS	2025-10-23 12:52:39.052194
40bd4a65-7f93-4bdb-999d-d47c85d6839d	1d003971-2ea7-46b3-8995-4ceb38f9bc77	encimap-hatfree-com-2ez6ql	2025-10-23 13:48:20.514871+00	\N	879fabc9-1b17-4802-b123-06c9d08627f3	$2b$12$87NC/fG3p91lwEaubXrxQuEZ.pI0vl9iTtimaTlJkzPl1Ng2yCwza	2025-10-23 13:48:20.514871
b3b4c0af-5388-4ab8-b316-6a6206cc960e	1d003971-2ea7-46b3-8995-4ceb38f9bc77	encimap-hatfree-com-wgb1sf	2025-10-23 14:32:20.703328+00	\N	c598cc50-73b2-4560-860b-78c1ca4610f8	$2b$12$0ldzSdIGMq1BY8kydPKbpeVBxEx5PEEE53sdpqLp7W1USRozOvVbC	2025-10-23 14:59:04.3
8be18148-67be-43fd-b31f-1c4152fbbc73	1d003971-2ea7-46b3-8995-4ceb38f9bc77	zaiga@hatfree.com	2025-10-23 16:42:59.689661+00	\N	afcf4a53-ddd2-497b-ae66-a8fe7cedb0d2	$2b$12$cdwUy8BI5qd5EaDgPOX1b.zBBQ4dzyA2isT3hffa3KQacIWxNnh3i	2025-10-23 16:42:59.689661
6b2e9781-e3f6-4c05-935e-fe9dd0398fbb	1d003971-2ea7-46b3-8995-4ceb38f9bc77	info@hatfree.com	2025-10-23 17:34:46.406751+00	\N	4feb0411-22a9-4f3b-a85e-a4c1444063f5	$2b$12$Wa17kZwplONuVd7qVEsZaeQakN56bmUR.O60SBPwXl.fqCHzmevD2	2025-10-23 17:35:08.697
19a0bbea-d812-4d9c-bebe-d157d293012f	1d003971-2ea7-46b3-8995-4ceb38f9bc77	crypto22@hatfree.com	2025-10-23 17:37:10.270812+00	\N	514481f0-8403-498d-a058-388af4d10f6e	$2b$12$phrFrHtyMNXbX.kaKZKGMeTiGpYRyLMp6eVlxVDinWfrVPiMoM202	2025-10-23 17:37:10.270812
3924dd8d-8233-4b61-8944-769d9bfd831e	0d1a3d72-8761-424a-be57-1358d28c6336	encimap-carmarket-lv-gdrory	2025-09-10 14:45:23.037189+00	\N	c2d84e7d-67c5-4429-beea-d2724b098970	$2b$12$2G/Smp10pSi7cHteI3lQnuHzlb57oK.4ONHLL0v9tBqEWRdlJ0sTm	2025-09-10 15:38:09.16845
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, vaultbox_id, message_id, from_domain, to_alias, size_bytes, received_at, storage, headers_meta, flags, tags) FROM stdin;
aaf17f39-a6d8-4a74-a32b-910b54525162	64f4545b-4740-4f76-b853-204160819c5f	\N	gmail.com	crypted	6319	2025-10-23 12:54:15.157062+00	{"alg": "smime-aes256", "bytes": 6319, "recipients": ["sha256:BEDC15422F0E6EF30F3E2624C96C342D5B1C9827A88D003C70EC38DA3AED17EE"], "maildir_path": "/var/mail/vaultboxes/64f4545b-4740-4f76-b853-204160819c5f/Maildir/new/1761224055066.73486037.encimap:2,"}	\N	{}	{}
430601d9-7533-4029-9928-4ae5203371ac	64f4545b-4740-4f76-b853-204160819c5f	\N	aol.com	crypted	12559	2025-10-23 13:17:52.220337+00	{"alg": "smime-aes256", "bytes": 12559, "recipients": ["sha256:BEDC15422F0E6EF30F3E2624C96C342D5B1C9827A88D003C70EC38DA3AED17EE"], "maildir_path": "/var/mail/vaultboxes/64f4545b-4740-4f76-b853-204160819c5f/Maildir/new/1761225472147.285058526.encimap:2,"}	\N	{}	{}
0d2f2bd4-c963-4b01-817a-27d6b742445d	64f4545b-4740-4f76-b853-204160819c5f	\N	inbox.lv	crypted	6363	2025-10-23 13:23:39.197915+00	{"alg": "smime-aes256", "bytes": 6363, "recipients": ["sha256:BEDC15422F0E6EF30F3E2624C96C342D5B1C9827A88D003C70EC38DA3AED17EE"], "maildir_path": "/var/mail/vaultboxes/64f4545b-4740-4f76-b853-204160819c5f/Maildir/new/1761225819118.874822440.encimap:2,"}	\N	{}	{}
78fd2eb1-b5dc-4914-b18c-1df613fe3c68	64f4545b-4740-4f76-b853-204160819c5f	\N	gmail.com	crypted	7184	2025-10-23 13:40:34.765815+00	{"alg": "smime-aes256", "bytes": 7184, "recipients": ["sha256:BEDC15422F0E6EF30F3E2624C96C342D5B1C9827A88D003C70EC38DA3AED17EE"], "maildir_path": "/var/mail/vaultboxes/64f4545b-4740-4f76-b853-204160819c5f/Maildir/new/1761226834597.205820159.encimap:2,"}	\N	{}	{}
399294e0-7648-486b-b269-71f7c3e7af5f	514481f0-8403-498d-a058-388af4d10f6e	\N	gmail.com	crypto22	5189	2025-10-23 17:39:46.03519+00	{"alg": "smime-aes256", "bytes": 5189, "recipients": ["sha256:65985D66D1BD7E234967E611927BE8649EB201837639A7A312170163F2D025E1"], "maildir_path": "/var/mail/vaultboxes/514481f0-8403-498d-a058-388af4d10f6e/Maildir/new/1761241185887.52640545.encimap:2,"}	\N	{}	{}
\.


--
-- Data for Name: vaultbox_certs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vaultbox_certs (id, vaultbox_id, label, public_cert_pem, fingerprint_sha256, created_at) FROM stdin;
fc8e70d5-a97b-41cf-aa26-369dfbf00d7a	c2d84e7d-67c5-4429-beea-d2724b098970	\N	-----BEGIN CERTIFICATE-----\nMIIDzDCCArSgAwIBAgIULd+qORRdO7U/tVNUJ4VaSzfsGzEwDQYJKoZIhvcNAQEL\nBQAwZDEPMA0GA1UEAwwGVGVzdGVyMSAwHgYJKoZIhvcNAQkBFhF0ZXN0QGNhcm1h\ncmtldC5sdjEvMC0GA1UECgwmTW90b3JpY2FsIEVuY3J5cHRlZCBJTUFQIChTZWxm\nLXNpZ25lZCkwHhcNMjUwOTEwMTQ0NTIyWhcNMjYwOTEwMTQ0NTIyWjBkMQ8wDQYD\nVQQDDAZUZXN0ZXIxIDAeBgkqhkiG9w0BCQEWEXRlc3RAY2FybWFya2V0Lmx2MS8w\nLQYDVQQKDCZNb3RvcmljYWwgRW5jcnlwdGVkIElNQVAgKFNlbGYtc2lnbmVkKTCC\nASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAK7JmRAEAM12s2pcii6b0fen\nxMLbUb7mkIAbsKyDWBQhCHt7fKp0WcFOW/oWoS7Z7BAdOGuieB+VuEr7MLX6A5zY\nZ+QzLDrpQukHQUjKXB4t1Z0xK+Z1YaRMqN+xi7kIC/F3zSkzfTqkLOGBmadmqsqq\nuz7eustw3fkRjvkfrvo9umm8AA6chY+2Gt2NCnM8+IQ01AVtNowW7mcum8hx6jQE\nBj4yRG+2wkTwxK2d5SmwOLgbSHtNTU9jutmsKdtFRSJzx3KUmVEit+O5rSvdPWRQ\n03yuC8ky1wdyxU8I5NbGHfIzJQVmTU+yF/OW1TYzb2xVpm1jKF88PbxY4S52oI0C\nAwEAAaN2MHQwCQYDVR0TBAIwADALBgNVHQ8EBAMCBLAwHQYDVR0lBBYwFAYIKwYB\nBQUHAwQGCCsGAQUFBwMCMBwGA1UdEQQVMBOBEXRlc3RAY2FybWFya2V0Lmx2MB0G\nA1UdDgQWBBRDEUyfEOb8xSF21fyIj3qKHTbGrDANBgkqhkiG9w0BAQsFAAOCAQEA\nE4d+SemBt+ujpGJzEQJc/Owd/jSIe5adL0+nhDFwmqlodyGk/w6MqOk8dops6FNS\ntF7cGZXUFIqQgnDeHuHUN2EOg6ComJRNcwN071hD0nzh0XGh2VtEAKJBWNTOKpb+\nzW3xfki/A7LqoQMRUmFEblkQ39w6VsmOWM2xZe0SPpLNc8ocN2DlZZQLejWnWnu9\n3S/exAKUlG5s+T7qanBHW9qz/MM1hpBgPFaQTtKEQ9Q9zU8iSt+V7M/OqVAVyC+n\n08eK4JA4E9MwfppS5a+GpPzgDVySfTFzvTzHk/44646ELO0pparEo755namHspIn\nKK6OXUrMO52doFDMv5pv2Q==\n-----END CERTIFICATE-----\n	sha256:LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0t	2025-09-10 14:45:22.261905+00
8820cbb1-7d6d-4956-a61f-db937ba85be1	64f4545b-4740-4f76-b853-204160819c5f	\N	-----BEGIN CERTIFICATE-----\nMIID1DCCArygAwIBAgIURokWlnow4y80Y6GsXxhGKKzQluEwDQYJKoZIhvcNAQEL\nBQAwZzEQMA4GA1UEAwwHQ3J5cHRlZDEiMCAGCSqGSIb3DQEJARYTY3J5cHRlZEBo\nYXRmcmVlLmNvbTEvMC0GA1UECgwmTW90b3JpY2FsIEVuY3J5cHRlZCBJTUFQIChT\nZWxmLXNpZ25lZCkwHhcNMjUxMDIzMTI1MjM4WhcNMjYxMDIzMTI1MjM4WjBnMRAw\nDgYDVQQDDAdDcnlwdGVkMSIwIAYJKoZIhvcNAQkBFhNjcnlwdGVkQGhhdGZyZWUu\nY29tMS8wLQYDVQQKDCZNb3RvcmljYWwgRW5jcnlwdGVkIElNQVAgKFNlbGYtc2ln\nbmVkKTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMMnNsXGTzD8PXE7\nTTTTHZhf69L2JAo6b56WRFG18DTuIYu4J6ZtTd7GyD55lgFKlWr87wmUtdD48TYd\nmaAfVxtDmdy5vN2S/BX2aUjWQ2QZvxCL4RvItnojJpclV7HAcPOiKxMIy2U7Isur\nRt8usqt+mPBEtK+mN5748sf+zM3DOBnOBnTV7mOXTZtaepd1Ra++wAjz/e3T9I8r\nDDXKwQ+xETX2kBS/0MyzAocykIQzO0ZiXS+fR8soGtCtcEDsZzJ5YSR+O6U8FAT2\n8//xApIkspPUCrqSZigVwCjMEV9L8mFokg2/8HMEteVYy0tq92/vb1lG+0jMxTN5\nvy/iW8kCAwEAAaN4MHYwCQYDVR0TBAIwADALBgNVHQ8EBAMCBLAwHQYDVR0lBBYw\nFAYIKwYBBQUHAwQGCCsGAQUFBwMCMB4GA1UdEQQXMBWBE2NyeXB0ZWRAaGF0ZnJl\nZS5jb20wHQYDVR0OBBYEFDoMI0BDCpV5knI/cagg7WIsHvipMA0GCSqGSIb3DQEB\nCwUAA4IBAQCFwYOCxa8dOwzRgfNkzyiS5WfRZC/79Pe24U65FG/VezQSmuaUuFkU\nCOJTM7xuaLPC2ERB/S7qgbQKEusG5m+e6hniwc88ta/itMT8PhbYiL0i9q5xymdz\nUlnY3h9ahNhRYkEVj/AJoT3vQPDWSh3bL8ZS7W5SFdONzvK9ThAz3YU6fjHQvLqO\nLpRlrTl5bHLhHVc0F0nRCSyvH15ZwEsZ4ycbLpb4GeppzN0oOXg0M3altEfAXM7m\nEh+H1483PxRNayeHHc5OuwcI/w0xmBO8XgT29UcAIwQ9ePNnW4tzu4n/utA0Zzob\nnvBsmVa8rJ1+tFED0vaBTPFSdWCj+Rzx\n-----END CERTIFICATE-----\n	sha256:LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0t	2025-10-23 12:52:38.309826+00
bd3db7e8-7ae7-4e41-a565-c8bebb324a64	514481f0-8403-498d-a058-388af4d10f6e	\N	-----BEGIN CERTIFICATE-----\nMIID0zCCArugAwIBAgIUH1ovV2Tk5plUBuIbff10/0PV9aQwDQYJKoZIhvcNAQEL\nBQAwZjEOMAwGA1UEAwwFQ3J5MjIxIzAhBgkqhkiG9w0BCQEWFGNyeXB0bzIyQGhh\ndGZyZWUuY29tMS8wLQYDVQQKDCZNb3RvcmljYWwgRW5jcnlwdGVkIElNQVAgKFNl\nbGYtc2lnbmVkKTAeFw0yNTEwMjMxNzM3MDlaFw0yNjEwMjMxNzM3MDlaMGYxDjAM\nBgNVBAMMBUNyeTIyMSMwIQYJKoZIhvcNAQkBFhRjcnlwdG8yMkBoYXRmcmVlLmNv\nbTEvMC0GA1UECgwmTW90b3JpY2FsIEVuY3J5cHRlZCBJTUFQIChTZWxmLXNpZ25l\nZCkwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCR2KwVxAdF3wGS6347\nffaBHQwZPWIyku0wdLnAYLRojtCe5FrCUJHjRwyddPecl6UjdwRd9gkfQK545rZt\nDrGmV5tPhscd+S0rubIIOr3pcn5MKgAcROKftQGsAITZtLBu9ObWtlNMX3hC/YOy\nmWkmtFauwdhI/JTFSdOQ9SGbYF5cnJczlEZF5o6hN40amkcKQQT+sD41qOFOCKV0\n3pvTgHs+gn1xxzmxLJ9aIEg2QjybEx7ex6d/EGTIJ6sRMyNExoyfjwsGWNyzYGGH\n+c3mmC8MplIFmH3uO0SQ4EfC9Buf4ersFJ00tm3ZhoFTTzjk+mjyA4nR13GaltRk\nlcQPAgMBAAGjeTB3MAkGA1UdEwQCMAAwCwYDVR0PBAQDAgSwMB0GA1UdJQQWMBQG\nCCsGAQUFBwMEBggrBgEFBQcDAjAfBgNVHREEGDAWgRRjcnlwdG8yMkBoYXRmcmVl\nLmNvbTAdBgNVHQ4EFgQUZA2MUG/bc6S0t7bN8cZ4SnmE9NMwDQYJKoZIhvcNAQEL\nBQADggEBAFdWOv0d3zv/DCKBFtKaiU3lzwZiydTerLKZV+uLzTYVnzfRoHLLi4G/\nA49g4cK+VZf9Y2FgYz0AiIZYz5zgpj0hGN5ItnrAGCuB4Xeku6W58hl3aNkzprWl\ntmVcMnJ672AogZipljKIKn+ujF6+DQBesLl4Koq9VROjmE0/GE/dutYrQotq0rYC\nbjsuGpoqavPis9vwiMlXQmNHXRvD3nQiLjuuXBpkURHQdnxCSgQ2Lz8Mn63mebMF\nhEZ4E8BNjo5ZqzOgzXY/eyKdh78nIM+3WkbhaDv4oOJfufO/x2WO6ItmVBOzqcE5\nunzNnS3NbThRfhdUbUzw9cV5kL87Pok=\n-----END CERTIFICATE-----\n	sha256:LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0t	2025-10-23 17:37:09.477305+00
\.


--
-- Data for Name: vaultbox_smtp_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vaultbox_smtp_credentials (id, vaultbox_id, username, password_hash, created_at, updated_at, last_used, enabled, host, port, security_type, messages_sent_count, last_message_sent) FROM stdin;
06f03126-a4c7-4375-9b9c-547ecbcfc51e	879fabc9-1b17-4802-b123-06c9d08627f3	encimap-hatfree-com-2ez6ql	$2b$12$qJ0b5DllIKHDuaftRccYoelgOrh1lN5fPS7rQPfphjT01z8pject6	2025-10-23 13:57:18.077818+00	2025-10-23 14:19:54.382432+00	\N	t	mail.motorical.com	587	STARTTLS	0	\N
a842c18a-9d5d-465c-a791-be57a814649a	c598cc50-73b2-4560-860b-78c1ca4610f8	encimap-hatfree-com-wgb1sf	$2b$12$I/kHr9EUQlGYx7KMKyxSg.MMzwUBCSnVm2WY5Iqz3sFTHUeOTCBia	2025-10-23 14:32:28.135181+00	2025-10-23 14:59:18.506322+00	\N	t	mail.motorical.com	587	STARTTLS	0	\N
f8a3b231-842a-41d6-82f2-c6d9372427d3	c2d84e7d-67c5-4429-beea-d2724b098970	encimap-carmarket-lv-gdrory	$2b$12$4bpg6t3ZuxmQFIAKg/wGQu7V.8WNKFBnWWUUbRrPKwU5K5VYfqWaa	2025-09-10 14:45:35.143407+00	2025-09-10 15:38:02.782257+00	\N	t	mail.motorical.com	587	STARTTLS	0	\N
\.


--
-- Data for Name: vaultboxes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vaultboxes (id, user_id, domain, name, status, limits, created_at, updated_at, smtp_enabled, alias, mailbox_type) FROM stdin;
c2d84e7d-67c5-4429-beea-d2724b098970	0d1a3d72-8761-424a-be57-1358d28c6336	carmarket.lv	Tester	active	{}	2025-09-10 14:45:21.513255+00	2025-09-10 14:45:21.513255+00	t	test	encrypted
64f4545b-4740-4f76-b853-204160819c5f	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Crypted	active	{}	2025-10-23 12:52:37.864328+00	2025-10-23 12:52:37.864328+00	f	crypted	encrypted
879fabc9-1b17-4802-b123-06c9d08627f3	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Operations	active	{}	2025-10-23 13:48:19.591377+00	2025-10-23 13:48:19.591377+00	f	operations	simple
c598cc50-73b2-4560-860b-78c1ca4610f8	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Forum Admin Hatfree	active	{}	2025-10-23 14:32:19.799955+00	2025-10-23 14:32:19.799955+00	f	forumadmin	simple
afcf4a53-ddd2-497b-ae66-a8fe7cedb0d2	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Zaiga Gaile	active	{}	2025-10-23 16:42:58.87021+00	2025-10-23 16:42:58.87021+00	f	zaiga	simple
4feb0411-22a9-4f3b-a85e-a4c1444063f5	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Info Support	active	{}	2025-10-23 17:34:45.57485+00	2025-10-23 17:34:45.57485+00	f	info	simple
514481f0-8403-498d-a058-388af4d10f6e	1d003971-2ea7-46b3-8995-4ceb38f9bc77	hatfree.com	Cry22	active	{}	2025-10-23 17:37:09.210379+00	2025-10-23 17:37:09.210379+00	f	crypto22	encrypted
\.


--
-- Name: imap_app_credentials imap_app_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: encimap
--

ALTER TABLE ONLY public.imap_app_credentials
    ADD CONSTRAINT imap_app_credentials_pkey PRIMARY KEY (id);


--
-- Name: imap_app_credentials imap_app_credentials_username_key; Type: CONSTRAINT; Schema: public; Owner: encimap
--

ALTER TABLE ONLY public.imap_app_credentials
    ADD CONSTRAINT imap_app_credentials_username_key UNIQUE (username);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: vaultbox_smtp_credentials unique_vaultbox_smtp_credentials; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_smtp_credentials
    ADD CONSTRAINT unique_vaultbox_smtp_credentials UNIQUE (vaultbox_id);


--
-- Name: vaultbox_certs vaultbox_certs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_certs
    ADD CONSTRAINT vaultbox_certs_pkey PRIMARY KEY (id);


--
-- Name: vaultbox_smtp_credentials vaultbox_smtp_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_smtp_credentials
    ADD CONSTRAINT vaultbox_smtp_credentials_pkey PRIMARY KEY (id);


--
-- Name: vaultbox_smtp_credentials vaultbox_smtp_credentials_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_smtp_credentials
    ADD CONSTRAINT vaultbox_smtp_credentials_username_key UNIQUE (username);


--
-- Name: vaultboxes vaultboxes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultboxes
    ADD CONSTRAINT vaultboxes_pkey PRIMARY KEY (id);


--
-- Name: idx_imap_app_credentials_vaultbox_id; Type: INDEX; Schema: public; Owner: encimap
--

CREATE INDEX idx_imap_app_credentials_vaultbox_id ON public.imap_app_credentials USING btree (vaultbox_id);


--
-- Name: idx_vaultbox_smtp_credentials_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultbox_smtp_credentials_enabled ON public.vaultbox_smtp_credentials USING btree (enabled);


--
-- Name: idx_vaultbox_smtp_credentials_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultbox_smtp_credentials_username ON public.vaultbox_smtp_credentials USING btree (username);


--
-- Name: idx_vaultbox_smtp_credentials_vaultbox_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultbox_smtp_credentials_vaultbox_id ON public.vaultbox_smtp_credentials USING btree (vaultbox_id);


--
-- Name: idx_vaultboxes_alias; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultboxes_alias ON public.vaultboxes USING btree (alias);


--
-- Name: idx_vaultboxes_mailbox_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultboxes_mailbox_type ON public.vaultboxes USING btree (mailbox_type);


--
-- Name: idx_vaultboxes_smtp_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultboxes_smtp_enabled ON public.vaultboxes USING btree (smtp_enabled);


--
-- Name: idx_vaultboxes_user_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vaultboxes_user_type ON public.vaultboxes USING btree (user_id, mailbox_type);


--
-- Name: vaultbox_smtp_credentials trigger_vaultbox_smtp_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_vaultbox_smtp_credentials_updated_at BEFORE UPDATE ON public.vaultbox_smtp_credentials FOR EACH ROW EXECUTE FUNCTION public.update_vaultbox_smtp_credentials_updated_at();


--
-- Name: imap_app_credentials imap_app_credentials_vaultbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: encimap
--

ALTER TABLE ONLY public.imap_app_credentials
    ADD CONSTRAINT imap_app_credentials_vaultbox_id_fkey FOREIGN KEY (vaultbox_id) REFERENCES public.vaultboxes(id) ON DELETE CASCADE;


--
-- Name: messages messages_vaultbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_vaultbox_id_fkey FOREIGN KEY (vaultbox_id) REFERENCES public.vaultboxes(id) ON DELETE CASCADE;


--
-- Name: vaultbox_certs vaultbox_certs_vaultbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_certs
    ADD CONSTRAINT vaultbox_certs_vaultbox_id_fkey FOREIGN KEY (vaultbox_id) REFERENCES public.vaultboxes(id) ON DELETE CASCADE;


--
-- Name: vaultbox_smtp_credentials vaultbox_smtp_credentials_vaultbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vaultbox_smtp_credentials
    ADD CONSTRAINT vaultbox_smtp_credentials_vaultbox_id_fkey FOREIGN KEY (vaultbox_id) REFERENCES public.vaultboxes(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO encimap;
GRANT ALL ON SCHEMA public TO motorical;


--
-- Name: TABLE imap_app_credentials; Type: ACL; Schema: public; Owner: encimap
--

GRANT ALL ON TABLE public.imap_app_credentials TO motorical;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messages TO encimap;
GRANT ALL ON TABLE public.messages TO motorical;


--
-- Name: TABLE vaultbox_certs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vaultbox_certs TO encimap;
GRANT ALL ON TABLE public.vaultbox_certs TO motorical;


--
-- Name: TABLE vaultbox_smtp_credentials; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vaultbox_smtp_credentials TO encimap;


--
-- Name: TABLE vaultboxes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vaultboxes TO encimap;
GRANT ALL ON TABLE public.vaultboxes TO motorical;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO encimap;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLES TO encimap;


--
-- PostgreSQL database dump complete
--

\unrestrict vjyksDJOMSXmMGAsuVKDXnrh8OwwJYv3dJffqnIC9fuGLB88PLPS7vsHXdGQPNr

