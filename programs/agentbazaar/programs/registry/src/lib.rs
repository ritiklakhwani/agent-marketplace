use anchor_lang::prelude::*;

declare_id!("DZWJYyh2kVcyE9r55CJEWdqVN5w6Ny9iCN4ZHNR3Ms6u");

pub const TRUSTED_SIGNER: Pubkey =
    anchor_lang::solana_program::pubkey!("33akonyj7usSVXf5nsCZgWANrz3BvVSFBsfR3utoeoLf");

pub const MAX_NAME_LEN: usize = 48;
pub const MAX_ENDPOINT_LEN: usize = 128;
pub const MAX_CATEGORY_LEN: usize = 32;

#[program]
pub mod registry {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        endpoint: String,
        category: String,
        price_hint: u64,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, RegistryError::FieldTooLong);
        require!(endpoint.len() <= MAX_ENDPOINT_LEN, RegistryError::FieldTooLong);
        require!(category.len() <= MAX_CATEGORY_LEN, RegistryError::FieldTooLong);

        let agent = &mut ctx.accounts.agent;
        agent.owner = ctx.accounts.owner.key();
        agent.name = name;
        agent.endpoint = endpoint;
        agent.category = category;
        agent.price_hint = price_hint;
        agent.successes = 0;
        agent.failures = 0;
        agent.score = 0;
        agent.total_volume = 0;
        agent.bump = ctx.bumps.agent;
        Ok(())
    }

    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        delta: i32,
        volume: u64,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            TRUSTED_SIGNER,
            RegistryError::Unauthorized
        );

        let agent = &mut ctx.accounts.agent;
        if delta > 0 {
            agent.successes = agent.successes.saturating_add(delta as u32);
        } else if delta < 0 {
            agent.failures = agent.failures.saturating_add(delta.unsigned_abs());
        }
        agent.score = agent.score.saturating_add(delta);
        agent.total_volume = agent.total_volume.saturating_add(volume);
        Ok(())
    }
}

#[account]
pub struct Agent {
    pub owner: Pubkey,         // 32
    pub name: String,          // 4 + MAX_NAME_LEN
    pub endpoint: String,      // 4 + MAX_ENDPOINT_LEN
    pub category: String,      // 4 + MAX_CATEGORY_LEN
    pub price_hint: u64,       // 8
    pub successes: u32,        // 4
    pub failures: u32,         // 4
    pub score: i32,            // 4
    pub total_volume: u64,     // 8
    pub bump: u8,              // 1
}

impl Agent {
    pub const SPACE: usize = 8  // discriminator
        + 32
        + 4 + MAX_NAME_LEN
        + 4 + MAX_ENDPOINT_LEN
        + 4 + MAX_CATEGORY_LEN
        + 8
        + 4
        + 4
        + 4
        + 8
        + 1;
}

#[derive(Accounts)]
#[instruction(name: String, endpoint: String, category: String)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = Agent::SPACE,
        seeds = [b"agent", owner.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, Agent>,

    pub authority: Signer<'info>,
}

#[error_code]
pub enum RegistryError {
    #[msg("Field exceeds maximum length")]
    FieldTooLong,
    #[msg("Only the trusted signer can update reputation")]
    Unauthorized,
}
